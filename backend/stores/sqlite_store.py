"""
Workspace storage in a local SQLite file.

This is what makes `git clone` and run work with no accounts: paired with
Ollama, the whole app needs no API key, no Postgres and no signup. It is the
default whenever SUPABASE_SERVICE_ROLE_KEY is absent.

Do not confuse this database with the one in data_handler.py. That one is an
in-memory SQLite built per request so the agent can run SQL against the
dataset, and is thrown away. This one is a file that persists workspaces and
chats between runs -- the local equivalent of the Postgres tables.

The schema mirrors supabase/migrations/20240101000000_baseline_schema.sql, with
jsonb becoming TEXT holding JSON. SQLite has no array type either, so
column_order is stored as a JSON array.
"""

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ._common import (
    HandlerCache,
    WorkspaceStoreError,
    column_order_of,
)

logger = logging.getLogger(__name__)

_conn: Optional[sqlite3.Connection] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def data_dir() -> Path:
    return Path(os.getenv("EDI_DATA_DIR") or ".edi-data").expanduser()


def _connect() -> sqlite3.Connection:
    """Open the workspace database, creating it on first use."""
    global _conn
    if _conn is not None:
        return _conn

    directory = data_dir()
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise WorkspaceStoreError(
            f"Could not create the local data directory {directory}: {exc}. "
            "Set EDI_DATA_DIR to somewhere writable."
        ) from exc

    path = directory / "workspaces.db"
    # check_same_thread=False because uvicorn serves requests from a thread
    # pool; the writes here are short and serialised by SQLite's own locking.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Concurrent reads while a write is in flight, which a dev server does
    # constantly as the sheet autosaves.
    conn.execute("pragma journal_mode = wal")
    conn.execute("pragma foreign_keys = on")

    conn.executescript(
        """
        create table if not exists workspaces (
            id text primary key,
            name text not null default 'Untitled',
            data text not null default '[]',
            filename text,
            column_order text,
            sheet_state text,
            chat_messages text,
            workspace_type text not null default 'work',
            description text,
            created_at text not null,
            last_modified text not null
        );

        create table if not exists chats (
            id text primary key,
            workspace_id text not null
                references workspaces(id) on delete cascade,
            title text not null default 'New Chat',
            messages text not null default '[]',
            context_state text not null default '{}',
            created_at text not null,
            updated_at text not null
        );

        create index if not exists idx_chats_workspace_id on chats(workspace_id);
        create index if not exists idx_chats_updated_at on chats(updated_at desc);

        create table if not exists usage_counters (
            bucket text not null,
            day text not null,
            count integer not null default 0,
            primary key (bucket, day)
        );
        """
    )
    conn.commit()

    _conn = conn
    logger.info("Workspaces stored locally in %s", path)
    return _conn


def _loads(value: Any, fallback: Any = None) -> Any:
    if value is None:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def fetch_row(workspace_id: str) -> Optional[dict]:
    """Return the raw workspace row, or None when it does not exist."""
    if not workspace_id:
        return None
    try:
        row = _connect().execute(
            "select data, filename, column_order from workspaces where id = ?",
            (workspace_id,),
        ).fetchone()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not read workspace {workspace_id}: {exc}") from exc

    if row is None:
        return None
    return {
        "data": _loads(row["data"], []),
        "filename": row["filename"],
        "column_order": _loads(row["column_order"]),
    }


def _write_rows(workspace_id: str, rows: List[dict], columns: List[str]) -> None:
    try:
        conn = _connect()
        conn.execute(
            "update workspaces set data = ?, column_order = ?, last_modified = ? where id = ?",
            (json.dumps(rows), json.dumps(columns), _now(), workspace_id),
        )
        conn.commit()
    except sqlite3.Error as exc:
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
    """Create an empty workspace and return its id."""
    workspace_id = str(uuid.uuid4())
    now = _now()
    try:
        conn = _connect()
        conn.execute(
            "insert into workspaces (id, name, data, workspace_type, created_at, last_modified)"
            " values (?, ?, '[]', 'work', ?, ?)",
            (workspace_id, name, now, now),
        )
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not create a workspace: {exc}") from exc

    logger.info("Created workspace %s", workspace_id)
    return workspace_id


def fetch_workspace(workspace_id: str) -> Optional[dict]:
    """Return everything the sheet needs to restore itself, or None if absent."""
    if not workspace_id:
        return None
    try:
        row = _connect().execute(
            "select id, name, data, filename, column_order, sheet_state, chat_messages"
            " from workspaces where id = ?",
            (workspace_id,),
        ).fetchone()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not read workspace {workspace_id}: {exc}") from exc

    if row is None:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "data": _loads(row["data"], []),
        "filename": row["filename"],
        "column_order": _loads(row["column_order"]),
        "sheet_state": _loads(row["sheet_state"]),
        "chat_messages": _loads(row["chat_messages"]),
    }


def save_workspace(
    workspace_id: str,
    data: Optional[List[dict]] = None,
    filename: Optional[str] = None,
    sheet_state: Any = None,
    column_order: Optional[List[str]] = None,
    chat_messages: Any = None,
    name: Optional[str] = None,
) -> None:
    """
    Write the sheet's current state back.

    Only the fields actually supplied are written, so a chat-only save does not
    blank the dataset and a data-only save does not blank the chat.
    """
    if not workspace_id:
        return

    columns: Dict[str, Any] = {"last_modified": _now()}
    if data is not None:
        columns["data"] = json.dumps(data)
        order = column_order if column_order is not None else column_order_of(data)
        columns["column_order"] = json.dumps(order)
        columns["filename"] = filename
    if sheet_state is not None:
        columns["sheet_state"] = json.dumps(sheet_state)
    if chat_messages is not None:
        columns["chat_messages"] = json.dumps(chat_messages)
    if name is not None:
        columns["name"] = name

    assignments = ", ".join(f"{name} = ?" for name in columns)
    try:
        conn = _connect()
        conn.execute(
            f"update workspaces set {assignments} where id = ?",
            (*columns.values(), workspace_id),
        )
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not save workspace {workspace_id}: {exc}") from exc

    if data is not None:
        _handlers.invalidate(workspace_id)


def list_workspaces(workspace_ids: List[str]) -> List[dict]:
    """
    Summarise the given workspaces, newest first, skipping ids that do not
    exist.

    Takes ids rather than listing the table because there is no sign-in: the
    browser holds the list of workspaces it created, and a query that returned
    every row would hand each visitor everyone else's sheets.

    Deliberately does not select `data` -- a workspace picker needs a name and
    a row count, not several megabytes of spreadsheet per entry.
    """
    ids = [i for i in (workspace_ids or []) if i]
    if not ids:
        return []

    placeholders = ", ".join("?" for _ in ids)
    try:
        rows = _connect().execute(
            "select id, name, filename, created_at, last_modified,"
            " json_array_length(data) as row_count"
            f" from workspaces where id in ({placeholders})"
            " order by last_modified desc",
            tuple(ids),
        ).fetchall()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not list workspaces: {exc}") from exc

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "filename": row["filename"],
            "row_count": row["row_count"] or 0,
            "created_at": row["created_at"],
            "last_modified": row["last_modified"],
        }
        for row in rows
    ]


def delete_workspace(workspace_id: str) -> bool:
    """
    Delete a workspace and everything in it. True if a row went.

    Chats go with it: the foreign key is `on delete cascade` and
    `pragma foreign_keys` is on for this connection.
    """
    if not workspace_id:
        return False
    try:
        conn = _connect()
        cursor = conn.execute("delete from workspaces where id = ?", (workspace_id,))
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not delete workspace {workspace_id}: {exc}") from exc

    _handlers.invalidate(workspace_id)
    return cursor.rowcount > 0


def list_chats(workspace_id: str) -> List[dict]:
    """Return a workspace's chat threads, newest first."""
    if not workspace_id:
        return []
    try:
        rows = _connect().execute(
            "select id, workspace_id, title, messages, context_state, updated_at"
            " from chats where workspace_id = ? order by updated_at desc",
            (workspace_id,),
        ).fetchall()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not read chats for {workspace_id}: {exc}") from exc

    return [
        {
            "id": row["id"],
            "workspace_id": row["workspace_id"],
            "title": row["title"],
            "messages": _loads(row["messages"], []),
            "context_state": _loads(row["context_state"], {}),
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def fetch_chat(chat_id: str) -> Optional[dict]:
    """Return a single chat thread, or None when it does not exist."""
    if not chat_id:
        return None
    try:
        row = _connect().execute(
            "select id, workspace_id, title, messages, context_state from chats where id = ?",
            (chat_id,),
        ).fetchone()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not read chat {chat_id}: {exc}") from exc

    if row is None:
        return None
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "title": row["title"],
        "messages": _loads(row["messages"], []),
        "context_state": _loads(row["context_state"], {}),
    }


def create_chat(workspace_id: str, title: str = "New Chat") -> dict:
    """Start a new chat thread in a workspace."""
    chat_id = str(uuid.uuid4())
    now = _now()
    try:
        conn = _connect()
        conn.execute(
            "insert into chats (id, workspace_id, title, messages, context_state,"
            " created_at, updated_at) values (?, ?, ?, '[]', '{}', ?, ?)",
            (chat_id, workspace_id, title, now, now),
        )
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not create a chat: {exc}") from exc

    return {
        "id": chat_id,
        "workspace_id": workspace_id,
        "title": title,
        "messages": [],
        "context_state": {},
        "created_at": now,
        "updated_at": now,
    }


def save_chat(chat_id: str, messages: Any = None, title: Optional[str] = None) -> None:
    """Persist a chat thread's messages and/or title."""
    if not chat_id:
        return

    columns: Dict[str, Any] = {"updated_at": _now()}
    if messages is not None:
        columns["messages"] = json.dumps(messages)
    if title is not None:
        columns["title"] = title

    assignments = ", ".join(f"{name} = ?" for name in columns)
    try:
        conn = _connect()
        conn.execute(
            f"update chats set {assignments} where id = ?",
            (*columns.values(), chat_id),
        )
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not save chat {chat_id}: {exc}") from exc


def delete_chat(chat_id: str) -> None:
    """Remove a chat thread."""
    if not chat_id:
        return
    try:
        conn = _connect()
        conn.execute("delete from chats where id = ?", (chat_id,))
        conn.commit()
    except sqlite3.Error as exc:
        raise WorkspaceStoreError(f"Could not delete chat {chat_id}: {exc}") from exc


def bump_usage(bucket: str) -> int:
    """
    Increment today's usage counter and return the new total.

    One statement, like the Postgres version, so two concurrent requests cannot
    read the same count and write the same total back. Local runs will usually
    want EDI_LIMITS_ENABLED=0 anyway -- the caps exist to protect a public
    demo's bill, which a local model does not have.
    """
    day = datetime.now(timezone.utc).date().isoformat()
    conn = _connect()
    row = conn.execute(
        "insert into usage_counters (bucket, day, count) values (?, ?, 1)"
        " on conflict (bucket, day) do update set count = count + 1"
        " returning count",
        (bucket, day),
    ).fetchone()
    conn.commit()
    return int(row["count"])
