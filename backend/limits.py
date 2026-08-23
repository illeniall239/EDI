"""
Usage limits for a public demo.

This app is a showcase: the link is public, there is no sign-up, and every
question costs a Gemini call billed to whoever deployed it. Without limits a
single visitor with a loop can spend the owner's quota in a minute, and the
whole thing doubles as a free LLM proxy for anyone who finds it.

Two independent limits, because they defend against different things:

  Per-visitor  Keeps one person from monopolising the demo. Keyed on client
               IP, which is a hint rather than an identity -- see _client_key.

  Global       A ceiling on what the deployment can spend in a day, across
               everyone. This is the one that actually protects the bill: it
               cannot be sidestepped by rotating IPs, clearing localStorage,
               or spoofing a header, because it counts calls and not callers.

Both daily counters live in Postgres rather than in memory. Serverless
instances share no state, so an in-memory counter only sees the slice of
traffic that happened to land on that instance -- a parallel flood spawns new
instances and defeats it entirely. An in-memory burst check runs first anyway,
since it is free and catches the common case (one client hammering a warm
instance) without a round trip.

If the counter table is missing the durable half degrades to a warning and the
in-memory half keeps working, so a deployment that skipped the migration is
rate limited loosely rather than broken.
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


def _int_env(name, default):
    """Read an integer setting, ignoring values that are not one."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("%s=%r is not an integer; using %d", name, raw, default)
        return default


# All overridable, so a deployment can be loosened for a demo day or tightened
# after one. The defaults are sized for "a few people trying it out", not for
# production traffic.
MAX_QUESTION_CHARS = _int_env("EDI_MAX_QUESTION_CHARS", 2000)
MAX_UPLOAD_BYTES = _int_env("EDI_MAX_UPLOAD_BYTES", 4 * 1024 * 1024)
MAX_ROWS = _int_env("EDI_MAX_ROWS", 20000)
MAX_COLUMNS = _int_env("EDI_MAX_COLUMNS", 100)

BURST_CALLS = _int_env("EDI_BURST_CALLS", 5)
BURST_WINDOW_SECONDS = _int_env("EDI_BURST_WINDOW_SECONDS", 60)
DAILY_CALLS_PER_VISITOR = _int_env("EDI_DAILY_CALLS_PER_VISITOR", 50)
DAILY_CALLS_TOTAL = _int_env("EDI_DAILY_CALLS_TOTAL", 1000)

# Set EDI_LIMITS_ENABLED=0 to turn the whole thing off when running locally.
ENABLED = os.getenv("EDI_LIMITS_ENABLED", "1").strip().lower() not in ("0", "false", "no")


# --------------------------------------------------------------------------
# Which requests cost an LLM call
# --------------------------------------------------------------------------
#
# Metering is opt-in per path rather than "everything under /api". The
# persistence endpoints (/api/workspace/..., /api/chats/...) are written on
# every edit to the sheet, so metering them at a few calls a minute would break
# ordinary use while protecting nothing -- they never reach Gemini.

_METERED_PREFIXES = (
    "/api/query",
    "/api/orchestrate",
    "/api/learn/",
    "/api/clarification-choice",
    "/api/extract-columns",
    "/api/generate-report",
    "/api/generate-synthetic-dataset",
    "/analyze-formula",
)

# Nested under /api/workspace/{id}/, which is otherwise unmetered.
_METERED_SUFFIXES = (
    "/analyze-insights",
    "/smart-format",
    "/quick-data-entry",
)


def is_metered(path):
    """True when serving this path is expected to call the LLM."""
    return path.startswith(_METERED_PREFIXES) or path.endswith(_METERED_SUFFIXES)


# --------------------------------------------------------------------------
# Identifying the caller
# --------------------------------------------------------------------------

def _client_key(request):
    """
    Best-effort identity for a caller.

    x-vercel-forwarded-for is set by the platform and cannot be forged by the
    client; the other headers can be, so they are only consulted when running
    somewhere else. Even then a forged header shifts which bucket a request is
    counted in, it does not create budget -- the global cap is what makes that
    survivable, and it is why this deliberately does not key on workspace_id,
    which the client picks for itself and can regenerate at will.
    """
    for header in ("x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"):
        value = request.headers.get(header)
        if value:
            # x-forwarded-for is a chain; the original client is the first hop.
            return value.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------
# In-memory burst check
# --------------------------------------------------------------------------

_recent = defaultdict(deque)
_recent_lock = threading.Lock()


def _burst_exceeded(key):
    """Sliding window over the calls this instance has seen from one caller."""
    now = time.monotonic()
    cutoff = now - BURST_WINDOW_SECONDS
    with _recent_lock:
        seen = _recent[key]
        while seen and seen[0] < cutoff:
            seen.popleft()
        if len(seen) >= BURST_CALLS:
            return True
        seen.append(now)

        # Callers that have gone quiet leave empty deques behind. Instances are
        # short-lived, but a busy one would otherwise grow a dict entry per IP
        # forever.
        if len(_recent) > 4096:
            for stale in [k for k, v in _recent.items() if not v]:
                del _recent[stale]
    return False


# --------------------------------------------------------------------------
# Durable daily counters
# --------------------------------------------------------------------------

_counter_unavailable = False
_counter_checked = False


def _bump(bucket):
    """
    Increment today's counter for `bucket` and return the new total.

    Returns None when the counter is unavailable, which the caller treats as
    "allow" -- a demo that has not run the migration should still work, just
    with the in-memory limit alone.
    """
    global _counter_unavailable, _counter_checked
    if _counter_unavailable:
        return None

    try:
        import workspace_store

        client = workspace_store._supabase()
        response = client.rpc("bump_usage", {"p_bucket": bucket}).execute()
        count = int(response.data)
        _counter_checked = True
        return count
    except Exception as exc:
        # Latch off after the first failure. The usual cause is the migration
        # not having been applied, which will not fix itself, and retrying adds
        # a failing round trip to every question.
        _counter_unavailable = True
        logger.warning(
            "Usage counters unavailable (%s). Falling back to the in-memory "
            "burst limit only; apply the usage_counters migration to enforce "
            "daily caps across instances.",
            exc,
        )
        return None


def _too_many(retry_after, message):
    return HTTPException(
        status_code=429,
        detail=message,
        headers={"Retry-After": str(retry_after)},
    )


def enforce_call_budget(request):
    """
    Charge one LLM call to the caller and to the deployment.

    Raises 429 when either budget is spent. Called before the work, so a
    request that is going to be refused never reaches Gemini.
    """
    if not ENABLED:
        return

    key = _client_key(request)

    if _burst_exceeded(key):
        raise _too_many(
            BURST_WINDOW_SECONDS,
            "That's a lot of questions at once. This is a demo, so it allows "
            "{calls} every {seconds} seconds -- give it a moment and try "
            "again.".format(calls=BURST_CALLS, seconds=BURST_WINDOW_SECONDS),
        )

    # Both counters are incremented even when the request is about to be
    # refused. That is deliberate: a client in a retry loop should not be able
    # to hold its own count down by being refused.
    visitor_count = _bump("ip:" + key)
    if visitor_count is not None and visitor_count > DAILY_CALLS_PER_VISITOR:
        raise _too_many(
            3600,
            "You've used today's {n} questions for this demo. It resets at "
            "midnight UTC. If you want more than that, the project is open "
            "source -- run it with your own API key.".format(
                n=DAILY_CALLS_PER_VISITOR
            ),
        )

    total_count = _bump("global")
    if total_count is not None and total_count > DAILY_CALLS_TOTAL:
        raise _too_many(
            3600,
            "This demo has hit its daily limit across all visitors. It resets "
            "at midnight UTC. The project is open source, so you can run it "
            "with your own API key in the meantime.",
        )


def status():
    """
    What is actually being enforced right now, for /api/health.

    The daily caps fail open, and a deployment missing the usage_counters
    migration looks identical to a working one until the bill arrives. This
    makes the difference checkable.

    `daily_counters` only becomes "unavailable" once something has tried to use
    them and failed, so "untested" means no metered request has been served
    yet, not that anything is wrong.
    """
    return {
        "enabled": ENABLED,
        "burst": "{calls} per {seconds}s".format(
            calls=BURST_CALLS, seconds=BURST_WINDOW_SECONDS
        ),
        "daily_per_visitor": DAILY_CALLS_PER_VISITOR,
        "daily_total": DAILY_CALLS_TOTAL,
        "daily_counters": "unavailable" if _counter_unavailable else (
            "active" if _counter_checked else "untested"
        ),
        "max_question_chars": MAX_QUESTION_CHARS,
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "max_rows": MAX_ROWS,
        "max_columns": MAX_COLUMNS,
    }


# --------------------------------------------------------------------------
# Payload limits
# --------------------------------------------------------------------------

def enforce_question_length(question):
    """
    Bound the prompt.

    Input tokens are the cheap half of a Gemini call but not a free one, and an
    unbounded question is the easiest way to turn one HTTP request into a large
    bill. It also closes off pasting a novel in to use the demo as a general
    chatbot.
    """
    if question is None:
        return ""
    if ENABLED and len(question) > MAX_QUESTION_CHARS:
        raise HTTPException(
            status_code=413,
            detail="That question is too long for this demo ({n} characters, "
                   "limit {limit}). Try asking it in fewer words.".format(
                       n=len(question), limit=MAX_QUESTION_CHARS
                   ),
        )
    return question


def enforce_upload_size(size):
    """
    Bound an upload.

    Vercel rejects bodies over 4.5MB before they reach this process, so on that
    platform this is a second line that produces a message explaining the limit
    instead of a platform error page. Everywhere else it is the only line.
    """
    if not ENABLED or size is None:
        return
    if size > MAX_UPLOAD_BYTES:
        # One decimal place, because integer megabytes render a file that is
        # a kilobyte over the limit as "That file is 4MB, the limit is 4MB".
        raise HTTPException(
            status_code=413,
            detail="That file is {mb:.1f}MB. This demo accepts files up to "
                   "{limit:.1f}MB.".format(
                       mb=size / (1024 * 1024),
                       limit=MAX_UPLOAD_BYTES / (1024 * 1024),
                   ),
        )


def enforce_dataset_size(rows, columns):
    """
    Bound the parsed dataset.

    Separate from the upload limit because the two do not track each other: a
    4MB CSV of short numeric columns is millions of cells, and every one of
    them is loaded into SQLite, held in memory, and written back to Postgres on
    each save. The schema is also summarised into the prompt, so column count
    feeds directly into the size of every request to Gemini.
    """
    if not ENABLED:
        return
    if rows > MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail="That file has {rows:,} rows. This demo works with up to "
                   "{limit:,} -- try a sample of it.".format(
                       rows=rows, limit=MAX_ROWS
                   ),
        )
    if columns > MAX_COLUMNS:
        raise HTTPException(
            status_code=413,
            detail="That file has {cols} columns. This demo works with up to "
                   "{limit}.".format(cols=columns, limit=MAX_COLUMNS),
        )
