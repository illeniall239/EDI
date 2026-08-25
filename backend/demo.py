"""
Demo mode.

The hosted demo exists to be tried, not to be lived in. Asking a visitor to
find a CSV before they can see whether the thing works is the wrong first
step, and remembering what they did is a promise this deployment does not
want to keep -- so demo mode hands every visitor the same sample dataset,
ready to ask questions about, and forgets them when they go.

Off unless EDI_DEMO_MODE=1, so a local install and a self-host are unaffected.

What "no persistence" does and does not mean: the backend is stateless and
re-reads the dataset from the store on every request that touches data, so a
session still needs a workspace row to hold the rows being filtered and
cleaned. Demo mode does not remove that row -- it stops the browser from
remembering it, and sweeps it up later. See `purge_demo_workspaces`.
"""

import csv
import logging
import os
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger(__name__)

ENABLED = os.getenv("EDI_DEMO_MODE", "").strip().lower() in {"1", "true", "yes", "on"}

SAMPLE_PATH = Path(__file__).parent / "demo_data" / "retail_sales.csv"
SAMPLE_FILENAME = "retail_sales.csv"
SAMPLE_WORKSPACE_NAME = "Sample data"

# Marks the rows this module creates, so the sweep can find them and never
# touches a real workspace on a deployment that has both.
WORKSPACE_TYPE = "demo"

# How long a visitor's demo workspace survives before it is swept. Long enough
# that nobody loses a session they are still in the middle of; short enough
# that the table does not grow without bound.
RETENTION_HOURS = 6

if ENABLED:
    import limits

    logger.info(
        "Demo mode is on: every visitor gets %s and nothing is remembered.",
        SAMPLE_FILENAME,
    )
    if not limits.ENABLED:
        # Demo mode means a public URL, and a public URL with no caps means
        # every visitor spends model quota without bound. limits.py warns
        # about this in general; here it is close to certain.
        logger.warning(
            "Demo mode is on but usage limits are not. Set EDI_LIMITS_ENABLED=1 "
            "-- a demo is a public URL, and every question on it is billed to you."
        )


_cache: List[Dict[str, object]] | None = None


def _coerce(value: str) -> object:
    """
    Numbers as numbers.

    The CSV is text, but the sheet and every SUM over it want numerics. This
    is deliberately narrow -- a value is a number only if it round-trips as
    one -- so an id like "007" or a version like "1.2.3" stays text.
    """
    text = value.strip()
    if not text:
        return ""
    try:
        as_int = int(text)
        return as_int if str(as_int) == text else text
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        return text


def sample_rows() -> List[Dict[str, object]]:
    """The demo dataset, parsed once and shared by every visitor."""
    global _cache
    if _cache is None:
        with SAMPLE_PATH.open(encoding="utf-8", newline="") as handle:
            _cache = [
                {key: _coerce(value) for key, value in row.items()}
                for row in csv.DictReader(handle)
            ]
        logger.info("Demo dataset loaded: %d rows from %s", len(_cache), SAMPLE_PATH.name)
    return [dict(row) for row in _cache]
