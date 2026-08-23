"""
Per-request dataset hydration for a stateless backend.

Vercel Functions have a read-only filesystem apart from /tmp, which does not
survive between invocations, and two consecutive requests are not guaranteed to
reach the same instance. The dataset therefore cannot live in a module-level
DataHandler the way it did when this ran as a long-lived server: whichever
instance handled the upload is rarely the one that handles the next query.

The data is already persisted -- the frontend writes it to the `workspaces`
table in Supabase (`data`, `filename`, `column_order`). This module reads that
row on the requests that need it and rebuilds a DataHandler, so any instance
can serve any request. Writing back through the same row means a change made by
the agent (deduplication, filtering, formatting) is picked up by the
spreadsheet UI's existing load path without extra syncing.

Downloading is cheap; parsing and loading into SQLite is not, so a warm
instance keeps the parsed DataHandler keyed by a hash of the rows and skips
rebuilding when nothing has changed. Correctness never depends on the cache --
the row is always fetched before the cache is consulted.
"""

import hashlib
import json
import logging
import os
from typing import Any, Dict, List, Optional

import pandas as pd

import settings
from data_handler import DataHandler

logger = logging.getLogger(__name__)

_client = None

# workspace_id -> (fingerprint of the stored rows, hydrated DataHandler)
_cache: Dict[str, Any] = {}

TABLE = "workspaces"


class WorkspaceStoreError(RuntimeError):
    """Raised when a workspace's dataset cannot be read or written."""


def _supabase():
    """Build the Supabase client lazily so importing never fails without env vars."""
    global _client
    if _client is not None:
        return _client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise WorkspaceStoreError(
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY so workspace data can be read."
        )

    from supabase import create_client

    # The anon key is subject to row-level security, which is scoped to an
    # authenticated end user. Server-side there is no user session, so RLS
    # returns zero rows and every request looks like "no data uploaded yet".
    # The service-role key bypasses RLS and is what this should run with.
    if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY is not set; falling back to the anon key. "
            "Row-level security will most likely hide every workspace row from "
            "the backend, which surfaces as 'please upload a dataset first'."
        )

    _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def _fingerprint(rows: List[dict], filename: Optional[str]) -> str:
    payload = json.dumps([rows, filename], sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _apply_column_order(df: pd.DataFrame, column_order: Optional[List[str]]) -> pd.DataFrame:
    """Restore the saved column order, appending any columns added since."""
    if not column_order:
        return df
    known = [c for c in column_order if c in df.columns]
    extra = [c for c in df.columns if c not in known]
    return df[known + extra] if known else df


def fetch_row(workspace_id: str) -> Optional[dict]:
    """Return the raw workspaces row, or None when it does not exist."""
    if not workspace_id:
        return None
    try:
        result = (
            _supabase()
            .table(TABLE)
            .select("data, filename, column_order")
            .eq("id", workspace_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not read workspace {workspace_id}: {exc}") from exc

    return getattr(result, "data", None)


def get_handler(workspace_id: str) -> Optional[DataHandler]:
    """
    Return a DataHandler hydrated from the workspace's stored rows.

    Returns None when the workspace has no data yet, which callers should
    surface as "upload a file first" rather than as a server error.
    """
    row = fetch_row(workspace_id)
    if not row:
        return None

    rows = row.get("data") or []
    if not rows:
        return None

    filename = row.get("filename") or "dataset.csv"
    fingerprint = _fingerprint(rows, filename)

    cached = _cache.get(workspace_id)
    if cached and cached[0] == fingerprint:
        return cached[1]

    df = _apply_column_order(pd.DataFrame(rows), row.get("column_order"))

    handler = DataHandler()
    handler.load_dataframe(df, filename)

    _cache[workspace_id] = (fingerprint, handler)
    return handler


def save_handler(workspace_id: str, handler: DataHandler) -> None:
    """
    Persist a DataHandler's current DataFrame back to the workspace row.

    Call this after any request that mutates the data, otherwise the change is
    lost when the instance goes away. Writing here also means the spreadsheet
    UI sees the change through its normal load path.
    """
    if not workspace_id or handler is None or handler.df is None:
        return

    df = handler.df
    # NaN is not valid JSON; the column is jsonb, so nulls must be real nulls.
    rows = json.loads(df.to_json(orient="records", date_format="iso"))

    try:
        _supabase().table(TABLE).update(
            {"data": rows, "column_order": df.columns.tolist()}
        ).eq("id", workspace_id).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not save workspace {workspace_id}: {exc}") from exc

    _cache[workspace_id] = (
        _fingerprint(rows, handler.display_filename),
        handler,
    )
    logger.info("Saved %d rows back to workspace %s", len(rows), workspace_id)


def forget(workspace_id: str) -> None:
    """Drop the cached handler for a workspace without touching stored data."""
    _cache.pop(workspace_id, None)
