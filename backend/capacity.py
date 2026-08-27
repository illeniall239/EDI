"""
How big a sheet this will open, and the refusal when a file is bigger.

The number is a fact about the browser, not about the server. Measured on this
machine, one fresh browser per size, timing an upload through to a grid that
has painted and can still answer a frame:

    rows     spinner gone   painted   usable
     20,000     4.2s          5.3s     5.3s
     70,000     2.5s          3.6s     3.6s
     80,000     2.7s          3.9s     3.9s
    100,000     6.6s          7.7s     7.7s
    110,000     6.9s          8.0s     8.0s
    120,000       --            --       --   nothing after five minutes
    150,000       --            --       --   nothing after five minutes

There is no slope to ride down. It is a cliff somewhere between 110,000 rows,
which opens in eight seconds and scrolls, and 120,000, which is a spinner that
never stops. The backend does not care either way -- it parsed and stored
200,000 rows in three seconds -- so a person past the cliff is looking at a
hung tab with a perfectly healthy server behind it, which is the worst way to
find out a limit exists.

The cap is 100,000 rather than the 110,000 that was measured to work, because
the cliff was measured on one machine and a slower one meets it sooner. One
step of headroom on a boundary that fails this badly is worth more than the
last ten thousand rows.

It is a ceiling on rows rather than bytes because rows are what the grid
draws; a megabyte of one column and a megabyte of forty are not the same
sheet.

EDI_MAX_ROWS moves it. Raise it if your machine is faster than this one or you
are willing to wait, set it to 0 to remove the ceiling entirely and get the
old behaviour back.
"""

import logging
import os

from fastapi import HTTPException

logger = logging.getLogger(__name__)

DEFAULT_MAX_ROWS = 100_000


def max_rows() -> int:
    """The ceiling in force. 0 means none."""
    raw = (os.getenv("EDI_MAX_ROWS") or "").strip()
    if not raw:
        return DEFAULT_MAX_ROWS
    try:
        value = int(raw)
    except ValueError:
        logger.warning("EDI_MAX_ROWS=%r is not a number; using %d", raw, DEFAULT_MAX_ROWS)
        return DEFAULT_MAX_ROWS
    return max(value, 0)


def enforce_row_count(rows: int) -> None:
    """
    Refuse a sheet the grid cannot draw, with a message that says what to do.

    413 rather than 400: this is a payload that is too large, and the frontend
    already treats that status as a deliberate boundary to show verbatim
    rather than an error to wrap in "something went wrong".
    """
    ceiling = max_rows()
    if not ceiling or rows <= ceiling:
        return
    raise HTTPException(
        status_code=413,
        detail=(
            f"That file has {rows:,} rows, and this opens up to {ceiling:,}. "
            f"Past that the spreadsheet stops rendering rather than getting slow, "
            f"so it would hang instead of loading. Split the file, filter it down, "
            f"or raise EDI_MAX_ROWS if you want to try anyway."
        ),
    )
