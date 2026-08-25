"""
Where workspaces are kept, and which backend keeps them.

Two implementations behind one set of functions:

  supabase  Postgres. What the hosted deployment runs on, and the only option
            that works on serverless, where the filesystem is read-only and
            no two requests are guaranteed to hit the same instance.

  sqlite    A local file. No account, no keys, no network. Paired with Ollama
            this is what lets someone clone the repo and have a working app
            without signing up for anything.

The default is chosen rather than required: if a Supabase service-role key is
present, use Supabase, since configuring one is a clear statement of intent.
Otherwise keep data locally. EDI_STORE always wins over the guess.
"""

import os

from dotenv import load_dotenv

# The choice below reads the environment at import time, and this package can
# be imported before settings.py is. Without this, a local run with Supabase
# configured in .env would silently fall back to the SQLite store because the
# file had not been read yet. load_dotenv is idempotent, so calling it in both
# places is free.
load_dotenv()

_BACKENDS = ("supabase", "sqlite")


def _chosen() -> str:
    explicit = (os.getenv("EDI_STORE") or "").strip().lower()
    if explicit:
        if explicit not in _BACKENDS:
            raise ValueError(
                f"EDI_STORE is set to '{explicit}'. Choose one of: {', '.join(_BACKENDS)}."
            )
        return explicit

    # Deliberately keyed on the service-role key rather than the URL: the URL
    # alone cannot read anything past row-level security, so a project with
    # only the URL set is not actually configured for Supabase.
    if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        return "supabase"
    return "sqlite"


BACKEND = _chosen()

if BACKEND == "supabase":
    from . import supabase_store as _impl
else:
    from . import sqlite_store as _impl

from ._common import WorkspaceStoreError  # noqa: E402  (re-exported)

# The storage-facing API. Every one of these has the same signature in both
# backends; anything that only exists in one is not part of it.
fetch_row = _impl.fetch_row
get_handler = _impl.get_handler
save_handler = _impl.save_handler
forget = _impl.forget
create_workspace = _impl.create_workspace
fetch_workspace = _impl.fetch_workspace
save_workspace = _impl.save_workspace
list_chats = _impl.list_chats
fetch_chat = _impl.fetch_chat
create_chat = _impl.create_chat
save_chat = _impl.save_chat
delete_chat = _impl.delete_chat
bump_usage = _impl.bump_usage


def status() -> dict:
    """What /api/health should say about persistence."""
    detail = None
    if BACKEND == "sqlite":
        detail = str(sqlite_data_dir())
    return {"backend": BACKEND, "location": detail}


def sqlite_data_dir():
    """The directory the local store writes to, whether or not it is in use."""
    from . import sqlite_store

    return sqlite_store.data_dir()


__all__ = [
    "BACKEND",
    "WorkspaceStoreError",
    "bump_usage",
    "create_chat",
    "create_workspace",
    "delete_chat",
    "fetch_chat",
    "fetch_row",
    "fetch_workspace",
    "forget",
    "get_handler",
    "list_chats",
    "save_chat",
    "save_handler",
    "save_workspace",
    "status",
]
