-- The tables everything else assumes.
--
-- This migration is newer than the two that follow it. Until it existed, the
-- repo carried migrations that ALTER `workspaces` but nothing that creates it,
-- so `supabase db push` against a fresh project failed on the first statement
-- and a clean clone could not be provisioned at all. The schema below is
-- reconstructed from what backend/stores/supabase.py actually reads and
-- writes, which is the only authoritative source now.
--
-- It is dated ahead of the others so it runs first, and is written to be safe
-- to apply to a project that already has these tables: every statement is
-- guarded, so an existing deployment can run it as a no-op rather than having
-- to know whether it needs it.

create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null default 'Untitled',

    -- The dataset itself: an array of row objects, exactly as pandas'
    -- to_json(orient="records") produces it. The backend is stateless and
    -- re-reads this on every request that touches data.
    data jsonb not null default '[]'::jsonb,
    filename text,

    -- Column order is stored separately because JSON object key order is not
    -- something to rely on, and the sheet must come back in the order the
    -- user left it.
    column_order text[],

    -- Full spreadsheet snapshot (formatting, widths, merges) for exact
    -- restore. The `data` column alone would lose everything but values.
    sheet_state jsonb,
    chat_messages jsonb,

    workspace_type varchar(20) not null default 'work',
    description text,

    -- Nullable and unowned: there is no sign-in. The browser keeps an
    -- anonymous workspace id in localStorage and that is the whole identity
    -- model. Kept as a column so the later remove-auth migration composes
    -- cleanly whichever order a project applies them in.
    user_id uuid,

    created_at timestamptz not null default now(),
    last_modified timestamptz not null default now()
);

-- `add constraint` has no IF NOT EXISTS, so guard it by hand to keep this
-- migration re-runnable. NOT VALID skips checking rows that are already there,
-- which matters for a project applying this after the fact.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'workspaces_workspace_type_check'
          and conrelid = 'public.workspaces'::regclass
    ) then
        alter table public.workspaces
            add constraint workspaces_workspace_type_check
            check (workspace_type in ('work', 'learn'))
            not valid;
    end if;
end $$;

create index if not exists idx_workspaces_last_modified
    on public.workspaces (last_modified desc);

create table if not exists public.chats (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null
        references public.workspaces(id) on delete cascade,
    title text not null default 'New Chat',
    messages jsonb not null default '[]'::jsonb,
    context_state jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_chats_workspace_id
    on public.chats (workspace_id);

-- list_chats() orders by this, newest first.
create index if not exists idx_chats_updated_at
    on public.chats (updated_at desc);

-- Row-level security on, with no policies at all.
--
-- This looks like a mistake and is not. The anon key ships inside the browser
-- bundle by design, so any policy written for it is a policy written for the
-- public. The browser never queries these tables: every read and write goes
-- through the FastAPI backend using the service-role key, which bypasses RLS.
-- Closed-by-default is therefore the correct posture, and opening it up is
-- what would be the bug.
alter table public.workspaces enable row level security;
alter table public.chats enable row level security;
