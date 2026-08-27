"""
How big a sheet this will open, and the refusal when one is bigger.

The number is a fact about the browser, not about the server. The backend
parsed and stored 200,000 rows in three seconds; the grid, given the same
file, never finished. So the ceiling is measured against the grid: one fresh
browser per sheet, timing an upload through to a grid that has painted and can
still answer a frame, giving up after three minutes.

Fifteen sheets were measured, and three candidate units tried against them:

                          cells      csv     json
      100,000 x 6       600,000    3.2M    10.0M    7.8s
      110,000 x 6       660,000    3.5M    11.1M    8.0s
      120,000 x 6       720,000    3.8M    12.1M    hang
       55,000 x 12      660,000    4.3M    12.2M    hang
       27,500 x 24      660,000    4.8M    13.1M    hang
      100,000 x 12    1,200,000    7.8M    22.2M    hang

Rows do not predict it: 110,000 rows renders and 55,000 hangs. Cells do not
predict it either: 660,000 cells renders six columns wide and hangs at twelve.
What separates every sheet measured, with nothing on the wrong side of the
line, is the size of the JSON the browser is handed -- everything up to 11.1MB
rendered and everything from 12.1MB hung.

Which is not a surprise once stated. The grid is not slow at drawing a wide
row; it is holding a JavaScript object per cell, and what runs out is memory.

CSV bytes separate the same sheets just as cleanly, and are the wrong unit
anyway: an xlsx is compressed, so the same sheet arrives a fraction of the
size and would sail past a byte limit set from a CSV. The measure here is
taken after parsing, from the rows themselves, so every format is judged as
the sheet it becomes.

The cap is 11MB: a tenth below the smallest sheet measured to hang, and above
every sheet measured to render bar one at 11.05MB. It is a margin rather than
a boundary, because these numbers came off one machine and one with less
memory meets the wall sooner. For the ordinary six-column sheet that is about
100,000 rows; at twelve columns about 50,000; at forty, about 13,000.

EDI_MAX_DATA_MB moves it. Raise it if your machine has memory to spare, or
set it to 0 to remove the ceiling and get the hang back.
"""

import json
import logging
import os
from typing import Any, Dict, List

from fastapi import HTTPException

logger = logging.getLogger(__name__)

DEFAULT_MAX_MB = 11.0


def max_bytes() -> int:
    """The ceiling in force, in bytes. 0 means none."""
    raw = (os.getenv("EDI_MAX_DATA_MB") or "").strip()
    if not raw:
        return int(DEFAULT_MAX_MB * 1024 * 1024)
    try:
        mb = float(raw)
    except ValueError:
        logger.warning("EDI_MAX_DATA_MB=%r is not a number; using %s", raw, DEFAULT_MAX_MB)
        mb = DEFAULT_MAX_MB
    return int(max(mb, 0) * 1024 * 1024)


def payload_bytes(records: List[Dict[str, Any]]) -> int:
    """
    How much JSON these rows come to.

    Measured rather than estimated. Serialising twice -- once here and once by
    the response -- costs a fraction of a second on a sheet near the ceiling,
    and an estimate that is wrong at the boundary costs somebody a hung tab.
    """
    return len(json.dumps(records, default=str).encode("utf-8"))


def enforce_payload(records: List[Dict[str, Any]], columns: int) -> None:
    """
    Refuse a sheet the grid cannot draw, with a message that says what to do.

    413 rather than 400: this is a payload that is too large, and the frontend
    already treats that status as a deliberate boundary to show verbatim
    rather than an error to wrap in "something went wrong".
    """
    ceiling = max_bytes()
    if not ceiling:
        return
    size = payload_bytes(records)
    if size <= ceiling:
        return

    mb = size / 1024 / 1024
    limit_mb = ceiling / 1024 / 1024
    # The shape, not just the total, because the shape is what they can change.
    fits = max(int(len(records) * ceiling / size), 1)
    raise HTTPException(
        status_code=413,
        detail=(
            f"That sheet is {len(records):,} rows across {columns} columns, which comes to "
            f"{mb:.1f}MB of data, and this opens up to {limit_mb:g}MB. Past that the "
            f"spreadsheet stops rendering rather than getting slow, so it would hang instead "
            f"of loading. At this width about {fits:,} rows would fit. Drop some columns, "
            f"split the file, or raise EDI_MAX_DATA_MB if you want to try anyway."
        ),
    )
