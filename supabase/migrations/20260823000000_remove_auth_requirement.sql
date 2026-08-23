-- Make workspaces ownerless.
--
-- EDI no longer has sign-in: there is one page, and the browser keeps an
-- anonymous workspace id in localStorage. `user_id` was NOT NULL with a
-- foreign key to auth.users, so with nobody signed in there is no value that
-- satisfies it and every insert fails with 23502 / 23503.
--
-- Row-level security is deliberately left switched on and closed. The browser
-- never queries this table -- the FastAPI backend does, with the service-role
-- key, which bypasses RLS. Opening the table to the anon role instead would
-- expose every workspace to anyone, because that key ships inside the client
-- bundle by design.

alter table public.workspaces
    drop constraint if exists workspaces_user_id_fkey;

alter table public.workspaces
    alter column user_id drop not null;
