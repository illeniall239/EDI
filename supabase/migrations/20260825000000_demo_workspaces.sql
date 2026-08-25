-- Demo mode stores its per-visitor workspaces as workspace_type = 'demo'.
--
-- The baseline constrains that column to ('work', 'learn'), so without this
-- every demo session fails at the insert -- on Postgres only. SQLite has no
-- such constraint, which is exactly why this was easy to miss: demo mode
-- works locally and breaks on the deployment it was written for.
--
-- The constraint is dropped and recreated rather than altered: Postgres has
-- no ALTER CONSTRAINT for a check expression.

alter table public.workspaces
    drop constraint if exists workspaces_workspace_type_check;

alter table public.workspaces
    add constraint workspaces_workspace_type_check
    check (workspace_type in ('work', 'learn', 'demo'))
    not valid;

-- The sweep deletes demo workspaces by type and age. Without this it is a
-- sequential scan of the whole table on every new demo session -- cheap while
-- the table is small, and quietly not cheap later.
create index if not exists idx_workspaces_demo_sweep
    on public.workspaces (workspace_type, last_modified)
    where workspace_type = 'demo';
