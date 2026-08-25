"""
The parts of workspace storage that do not care where the rows are kept.

Turning stored rows into a queryable DataHandler is the expensive step --
parsing and loading into SQLite, not the fetch -- and it is identical whether
the rows came from Postgres or a local file. So it lives here once, and each
backend supplies only the two functions that actually touch storage.
"""

import hashlib
import json
import logging
from typing import Any, Callable, Dict, List, Optional

import pandas as pd

from data_handler import DataHandler

logger = logging.getLogger(__name__)


class WorkspaceStoreError(RuntimeError):
    """Raised when a workspace's dataset cannot be read or written."""


def fingerprint(rows: List[dict], filename: Optional[str]) -> str:
    payload = json.dumps([rows, filename], sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def apply_column_order(df: pd.DataFrame, column_order: Optional[List[str]]) -> pd.DataFrame:
    """Restore the saved column order, appending any columns added since."""
    if not column_order:
        return df
    known = [c for c in column_order if c in df.columns]
    extra = [c for c in df.columns if c not in known]
    return df[known + extra] if known else df


def column_order_of(rows: List[dict]) -> List[str]:
    """Union of keys across rows, in order of first appearance."""
    order: List[str] = []
    for row in rows or []:
        if isinstance(row, dict):
            for key in row:
                if key not in order:
                    order.append(key)
    return order


def rows_of(df: pd.DataFrame) -> List[dict]:
    """A DataFrame as JSON-safe row dicts."""
    # NaN is not valid JSON, so go through pandas' serialiser rather than
    # to_dict() -- nulls must come out as real nulls.
    return json.loads(df.to_json(orient="records", date_format="iso"))


class HandlerCache:
    """
    Hydrates workspaces into DataHandlers, and remembers the result.

    Downloading a row is cheap; parsing it and loading it into SQLite is not.
    A warm instance keeps the parsed handler keyed by a hash of the rows and
    skips rebuilding when nothing has changed. Correctness never depends on the
    cache -- the row is always fetched before the cache is consulted.
    """

    def __init__(
        self,
        fetch_row: Callable[[str], Optional[dict]],
        write_rows: Callable[[str, List[dict], List[str]], None],
    ):
        self._fetch_row = fetch_row
        self._write_rows = write_rows
        self._cache: Dict[str, Any] = {}

    def get(self, workspace_id: str) -> Optional[DataHandler]:
        """
        Return a DataHandler hydrated from the workspace's stored rows.

        Returns None when the workspace has no data yet, which callers should
        surface as "upload a file first" rather than as a server error.
        """
        row = self._fetch_row(workspace_id)
        if not row:
            return None

        rows = row.get("data") or []
        if not rows:
            return None

        filename = row.get("filename") or "dataset.csv"
        mark = fingerprint(rows, filename)

        cached = self._cache.get(workspace_id)
        if cached and cached[0] == mark:
            return cached[1]

        df = apply_column_order(pd.DataFrame(rows), row.get("column_order"))

        handler = DataHandler()
        handler.load_dataframe(df, filename)

        self._cache[workspace_id] = (mark, handler)
        return handler

    def save(self, workspace_id: str, handler: DataHandler) -> None:
        """
        Persist a DataHandler's current DataFrame back to the workspace.

        Call this after any request that mutates the data, otherwise the change
        is lost when the instance goes away. Writing here also means the
        spreadsheet UI sees the change through its normal load path.
        """
        if not workspace_id or handler is None or handler.df is None:
            return

        df = handler.df
        rows = rows_of(df)
        self._write_rows(workspace_id, rows, df.columns.tolist())

        self._cache[workspace_id] = (fingerprint(rows, handler.display_filename), handler)
        logger.info("Saved %d rows back to workspace %s", len(rows), workspace_id)

    def invalidate(self, workspace_id: str) -> None:
        """Drop the cached handler without touching stored data."""
        self._cache.pop(workspace_id, None)
