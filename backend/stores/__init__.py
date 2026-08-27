"""
Where workspaces are kept.

One implementation: a SQLite file on the machine running the backend, under
`EDI_DATA_DIR` (`./.edi-data/` by default). Workspaces, chats and the usage
counters all live there. No account, no keys, no network.

There used to be a second backend, Postgres through Supabase, chosen at import
time from the environment. It existed to make the app work on serverless,
where the filesystem is read-only and no two requests are guaranteed to reach
the same instance. Nothing runs there any more: the hosted deployment serves
documentation only, and the app is something you run yourself. Keeping a
second store meant a second schema to provision, a service-role key to guard,
a row-level-security posture to explain, and a setup path nobody had verified
end to end. It is gone, and this package is the seam it left behind.

The seam is worth keeping. Every caller goes through these names rather than
touching SQLite directly, so a future store is one module and one import
rather than a hunt through main.py.
"""

from . import sqlite_store as _impl
from ._common import WorkspaceStoreError  # noqa: F401  (re-exported)

BACKEND = "sqlite"

# The storage-facing API.
fetch_row = _impl.fetch_row
get_handler = _impl.get_handler
save_handler = _impl.save_handler
forget = _impl.forget
create_workspace = _impl.create_workspace
fetch_workspace = _impl.fetch_workspace
save_workspace = _impl.save_workspace
list_workspaces = _impl.list_workspaces
delete_workspace = _impl.delete_workspace
list_chats = _impl.list_chats
fetch_chat = _impl.fetch_chat
create_chat = _impl.create_chat
save_chat = _impl.save_chat
delete_chat = _impl.delete_chat
bump_usage = _impl.bump_usage

# The names above, as data. workspace_store.py re-exports this API by hand for
# the call sites that predate this package, and CI checks it against this list
# so a function added here cannot go missing there -- a gap that neither a
# lint nor an import catches, only calling the endpoint.
STORAGE_API = (
    "fetch_row",
    "get_handler",
    "save_handler",
    "forget",
    "create_workspace",
    "fetch_workspace",
    "save_workspace",
    "list_workspaces",
    "delete_workspace",
    "list_chats",
    "fetch_chat",
    "create_chat",
    "save_chat",
    "delete_chat",
    "bump_usage",
)


def status() -> dict:
    """What /api/health should say about persistence."""
    return {"backend": BACKEND, "location": str(sqlite_data_dir())}


def sqlite_data_dir():
    """The directory the store writes to."""
    return _impl.data_dir()


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
