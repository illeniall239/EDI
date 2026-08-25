"""
Backwards-compatible alias for the `stores` package.

Workspace persistence used to be this single Supabase-only module. It now has
two backends and lives in stores/, but ~30 call sites across main.py and
agent_services.py import this name, so it stays as a re-export rather than
churning all of them.

New code should import `stores` directly.
"""

from stores import (  # noqa: F401
    BACKEND,
    WorkspaceStoreError,
    bump_usage,
    create_chat,
    create_workspace,
    delete_chat,
    delete_workspace,
    fetch_chat,
    fetch_row,
    fetch_workspace,
    forget,
    get_handler,
    list_chats,
    list_workspaces,
    purge_demo_workspaces,
    save_chat,
    save_handler,
    save_workspace,
    status,
)
