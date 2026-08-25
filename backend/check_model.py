"""
Check whether the configured model can actually do this job.

EDI is a harness: you bring the model. Any Ollama model, any provider key --
and the quality of what comes back is a property of that choice, not of this
code. Which makes "is my model good enough?" a real question, and one no
README can answer for you, because it depends on the model you picked.

So measure it instead. This runs the four things the app actually asks of a
model and shows you what yours returned:

  1. Reachable      Can we talk to it at all, and how fast.
  2. Strict JSON    Nearly every feature here asks for JSON and parses the
                    reply. A model that answers in prose instead fails the
                    step that routes your request, before anything else runs.
  3. SQL            Questions are answered by generating SQL against your
                    sheet, so a model that writes bad SQL gives confidently
                    wrong numbers rather than errors.

  4. Routing        Before any SQL is written, the app decides whether your
                    message is a question about the data or ordinary
                    conversation. Get that wrong and a model that can write
                    perfect SQL never gets the chance -- it answers "I don't
                    have that information" instead.

Passing all four is a floor, not a guarantee. These prompts are deliberately
short and unambiguous; the app's real ones are much longer and carry
conversation history, and a model can clear every check here and still lose the
thread on those. Treat a FAIL as decisive and a PASS as "worth trying".

Usage:

    python backend/check_model.py

It reads the same environment the app does, so whatever you have configured is
what gets tested.
"""

import json
import re
import sys
import time

import llm_providers


PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"


def _content(reply) -> str:
    return (getattr(reply, "content", None) or str(reply)).strip()


def _unfence(text: str) -> str:
    return re.sub(r"^```(?:json|sql)?|```$", "", text, flags=re.MULTILINE).strip()


def check_reachable(model):
    started = time.time()
    try:
        reply = model.invoke("Reply with exactly: OK")
    except Exception as exc:
        return FAIL, f"{type(exc).__name__}: {exc}", None
    elapsed = time.time() - started
    text = _content(reply)
    if not text:
        return FAIL, "empty reply", elapsed
    return PASS, text[:60], elapsed


def check_json(model):
    prompt = (
        'Return ONLY this JSON object, with no explanation and no markdown '
        'fences: {"intent": "filter", "confidence": 0.9}'
    )
    started = time.time()
    try:
        text = _unfence(_content(model.invoke(prompt)))
    except Exception as exc:
        return FAIL, f"{type(exc).__name__}: {exc}", None
    elapsed = time.time() - started

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        # The app recovers by grabbing the first {...} it can find, so a model
        # that wraps JSON in a sentence still works -- just less reliably.
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                json.loads(match.group(0))
                return WARN, f"JSON buried in prose: {text[:90]}", elapsed
            except json.JSONDecodeError:
                pass
        return FAIL, f"not JSON: {text[:90]}", elapsed

    if not isinstance(payload, dict) or "intent" not in payload:
        return WARN, f"JSON, but not the shape asked for: {text[:90]}", elapsed
    return PASS, text[:90], elapsed


SQL_PROMPT = """You are given a SQLite table named sales with these columns:
  region TEXT, rep TEXT, revenue REAL

Write one SQL query that returns the total revenue for the South region.
Reply with the SQL only. No explanation, no markdown code fences."""


def check_sql(model):
    started = time.time()
    try:
        text = _unfence(_content(model.invoke(SQL_PROMPT)))
    except Exception as exc:
        return FAIL, f"{type(exc).__name__}: {exc}", None
    elapsed = time.time() - started

    # Run it, rather than eyeballing it. A query that looks plausible and
    # returns the wrong number is the failure mode that matters here.
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.execute("create table sales (region text, rep text, revenue real)")
    conn.executemany(
        "insert into sales values (?, ?, ?)",
        [("South", "A. Chen", 1200.50), ("North", "B. Diaz", 900.25),
         ("South", "C. Ito", 300.00)],
    )

    statement = text.split(";")[0].strip()
    try:
        rows = conn.execute(statement).fetchall()
    except sqlite3.Error as exc:
        return FAIL, f"{exc}  <-  {text[:90]}", elapsed

    if len(rows) == 1 and len(rows[0]) == 1 and rows[0][0] is not None:
        if abs(float(rows[0][0]) - 1500.50) < 0.01:
            return PASS, f"{statement[:90]} -> 1500.5", elapsed
        return FAIL, f"wrong answer {rows[0][0]} (want 1500.5): {statement[:70]}", elapsed
    return WARN, f"ran, but shape is odd: {rows}  <-  {statement[:70]}", elapsed


ROUTING_PROMPT = """A user is looking at a spreadsheet of sales data with columns:
region, rep, revenue.

Decide what their message is. Answer with one word and nothing else:

  DATA    - a question that should be answered from the spreadsheet
  CHAT    - small talk, greetings, or a question unrelated to the data

Message: "{message}"

Answer:"""

# Two that must be DATA and one that must be CHAT. The first is phrased the way
# people actually ask, which is where weaker models start treating a data
# question as conversation.
ROUTING_CASES = [
    ("What is the total revenue for the South region?", "DATA"),
    ("which rep sold the most", "DATA"),
    ("hey, how are you doing today?", "CHAT"),
]


def check_routing(model):
    started = time.time()
    wrong = []
    for message, expected in ROUTING_CASES:
        try:
            text = _content(model.invoke(ROUTING_PROMPT.format(message=message)))
        except Exception as exc:
            return FAIL, f"{type(exc).__name__}: {exc}", time.time() - started

        got = "DATA" if "DATA" in text.upper()[:40] else (
            "CHAT" if "CHAT" in text.upper()[:40] else text[:24]
        )
        if got != expected:
            wrong.append(f"{message[:34]!r} -> {got} (want {expected})")

    elapsed = time.time() - started
    if not wrong:
        return PASS, f"{len(ROUTING_CASES)}/{len(ROUTING_CASES)} routed correctly", elapsed
    if len(wrong) == len(ROUTING_CASES):
        return FAIL, "; ".join(wrong)[:150], elapsed
    return WARN, "; ".join(wrong)[:150], elapsed


def main() -> int:
    config = llm_providers.resolve()
    problem = llm_providers.describe(config)

    print()
    print(f"  provider   {config.provider}")
    print(f"  model      {config.model or '(none set)'}")
    if config.base_url:
        print(f"  endpoint   {config.base_url}")
    print()

    if problem:
        print(f"  {FAIL}  {problem}")
        print()
        return 1

    try:
        model = llm_providers.build(config, temperature=0.0)
    except llm_providers.ProviderError as exc:
        print(f"  {FAIL}  {exc}")
        print()
        return 1

    checks = [
        ("reachable", check_reachable),
        ("strict JSON", check_json),
        ("SQL", check_sql),
        ("routing", check_routing),
    ]

    worst = PASS
    for name, check in checks:
        status, detail, elapsed = check(model)
        timing = f"{elapsed:5.1f}s" if elapsed is not None else "    -"
        print(f"  {status:4}  {name:12} {timing}  {detail}")
        if status == FAIL:
            worst = FAIL
        elif status == WARN and worst == PASS:
            worst = WARN

    print()
    if worst == PASS:
        print("  Worth trying. These prompts are simpler than the app's real")
        print("  ones, so this is a floor rather than a guarantee -- if answers")
        print("  come back wrong in use, the model is still the first suspect.")
    elif worst == WARN:
        print("  Usable, but expect the occasional bad answer. A larger or")
        print("  instruction-tuned model will behave better.")
    else:
        print("  This model is not up to it. SQL and routing are the checks")
        print("  that matter -- failing either means wrong answers rather than")
        print("  errors, which is the worse way to be wrong.")
        print("  Try a larger model, or one tuned for instructions or code.")
    print()

    return 0 if worst != FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
