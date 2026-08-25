"""
Workspace storage in Supabase Postgres.

This is the backend the hosted deployment runs on. Vercel Functions have a
read-only filesystem apart from /tmp, which does not survive between
invocations, and two consecutive requests are not guaranteed to reach the same
instance -- so the dataset cannot live in a module-level DataHandler. It lives
in the `workspaces` row, and any instance can serve any request by re-reading
it.

For running locally with no cloud account, see sqlite_store.py.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import settings

from ._common import (
    HandlerCache,
    WorkspaceStoreError,
    column_order_of,
)

logger = logging.getLogger(__name__)

_client = None

TABLE = "workspaces"
CHATS_TABLE = "chats"


def _supabase():
    """Build the Supabase client lazily so importing never fails without env vars."""
    global _client
    if _client is not None:
        return _client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise WorkspaceStoreError(
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY so workspace data can be read, or set "
            "EDI_STORE=sqlite to keep workspaces in a local file instead."
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


def _write_rows(workspace_id: str, rows: List[dict], columns: List[str]) -> None:
    try:
        _supabase().table(TABLE).update(
            {"data": rows, "column_order": columns}
        ).eq("id", workspace_id).execute()
    except Exception as exc:
        raise WorkspaceStoreError(f"Could not save workspace {workspace_id}: {exc}") from exc


_handlers = HandlerCache(fetch_row, _write_rows)


def get_handler(workspace_id: str):
    return _handlers.get(workspace_id)


def save_handler(workspace_id: str, handler) -> None:
    _handlers.save(workspace_id, handler)


def forget(workspace_id: str) -> None:
    """Drop the cached handler for a workspace without touching stored data."""
    _handlers.invalidate(workspace_id)


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
        payload["column_order"] = column_order if column_order is not None else column_order_of(data)
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
        _handlers.invalidate(workspace_id)


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


def bump_usage(bucket: str) -> int:
    """
    Increment today's usage counter and return the new total.

    Atomic in one statement server-side -- see the usage_counters migration.
    Raises if the migration has not been applied; limits.py treats that as
    "allow" and falls back to the in-memory burst limit.
    """
    response = _supabase().rpc("bump_usage", {"p_bucket": bucket}).execute()
    return int(response.data)
