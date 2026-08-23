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
import uuid
from datetime import datetime, timezone
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


def create_workspace(name: str = "Untitled") -> str:
    """
    Create an empty workspace row and return its id.

    There is no sign-in, so the row has no owner. Everything reaches this table
    through the service-role key on the server; the browser never talks to
    Supabase directly, which is what keeps row-level security able to stay shut
    against the public anon key.
    """
    workspace_id = str(uuid.uuid4())
    try:
        _supabase().table(TABLE).insert(
            {
                "id": workspace_id,
                "name": name,
                "data": [],
                "workspace_type": "work",
            }
        ).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not create a workspace: {exc}") from exc

    logger.info("Created workspace %s", workspace_id)
    return workspace_id


def fetch_workspace(workspace_id: str) -> Optional[dict]:
    """Return everything the sheet needs to restore itself, or None if absent."""
    if not workspace_id:
        return None
    try:
        result = (
            _supabase()
            .table(TABLE)
            .select("id, name, data, filename, column_order, sheet_state, chat_messages")
            .eq("id", workspace_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not read workspace {workspace_id}: {exc}") from exc

    return getattr(result, "data", None)


def save_workspace(
    workspace_id: str,
    data: Optional[List[dict]] = None,
    filename: Optional[str] = None,
    sheet_state: Any = None,
    column_order: Optional[List[str]] = None,
    chat_messages: Any = None,
) -> None:
    """
    Write the sheet's current state back to its row.

    Only the fields actually supplied are written, so a chat-only save does not
    blank the dataset and a data-only save does not blank the chat.
    """
    if not workspace_id:
        return

    payload: Dict[str, Any] = {"last_modified": datetime.now(timezone.utc).isoformat()}
    if data is not None:
        payload["data"] = data
        payload["column_order"] = column_order if column_order is not None else _column_order(data)
        payload["filename"] = filename
    if sheet_state is not None:
        payload["sheet_state"] = sheet_state
    if chat_messages is not None:
        payload["chat_messages"] = chat_messages

    try:
        _supabase().table(TABLE).update(payload).eq("id", workspace_id).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not save workspace {workspace_id}: {exc}") from exc

    # The stored rows just changed underneath any hydrated handler.
    if data is not None:
        _cache.pop(workspace_id, None)


def _column_order(rows: List[dict]) -> List[str]:
    """Union of keys across rows, in order of first appearance."""
    order: List[str] = []
    for row in rows or []:
        if isinstance(row, dict):
            for key in row:
                if key not in order:
                    order.append(key)
    return order


CHATS_TABLE = "chats"


def list_chats(workspace_id: str) -> List[dict]:
    """Return a workspace's chat threads, newest first."""
    if not workspace_id:
        return []
    try:
        result = (
            _supabase()
            .table(CHATS_TABLE)
            .select("id, workspace_id, title, messages, context_state, updated_at")
            .eq("workspace_id", workspace_id)
            .order("updated_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not read chats for {workspace_id}: {exc}") from exc
    return getattr(result, "data", None) or []


def fetch_chat(chat_id: str) -> Optional[dict]:
    """Return a single chat thread, or None when it does not exist."""
    if not chat_id:
        return None
    try:
        result = (
            _supabase()
            .table(CHATS_TABLE)
            .select("id, workspace_id, title, messages, context_state")
            .eq("id", chat_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not read chat {chat_id}: {exc}") from exc
    return getattr(result, "data", None)


def create_chat(workspace_id: str, title: str = "New Chat") -> dict:
    """Start a new chat thread in a workspace."""
    try:
        result = (
            _supabase()
            .table(CHATS_TABLE)
            .insert(
                {
                    "workspace_id": workspace_id,
                    "title": title,
                    "messages": [],
                    "context_state": {},
                }
            )
            .execute()
        )
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not create a chat: {exc}") from exc

    rows = getattr(result, "data", None) or []
    if not rows:
        raise WorkspaceStoreError("Chat was created but Supabase returned no row.")
    return rows[0]


def save_chat(chat_id: str, messages: Any = None, title: Optional[str] = None) -> None:
    """Persist a chat thread's messages and/or title."""
    if not chat_id:
        return

    payload: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if messages is not None:
        payload["messages"] = messages
    if title is not None:
        payload["title"] = title

    try:
        _supabase().table(CHATS_TABLE).update(payload).eq("id", chat_id).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not save chat {chat_id}: {exc}") from exc


def delete_chat(chat_id: str) -> None:
    """Remove a chat thread."""
    if not chat_id:
        return
    try:
        _supabase().table(CHATS_TABLE).delete().eq("id", chat_id).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not delete chat {chat_id}: {exc}") from exc


def forget(workspace_id: str) -> None:
    """Drop the cached handler for a workspace without touching stored data."""
    _cache.pop(workspace_id, None)
