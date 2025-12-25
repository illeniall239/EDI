-- Add sheet_state JSONB snapshot column for full Luckysheet state persistence
-- Safe to run multiple times (IF NOT EXISTS guards)

BEGIN;

-- 1) Add column to store full spreadsheet snapshot
ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS sheet_state JSONB;

COMMENT ON COLUMN public.workspaces.sheet_state IS 'Full Luckysheet sheets snapshot (array) captured from getAllSheets() for exact restore.';

-- 2) Optional GIN index for JSONB queries (harmless if unused)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_workspaces_sheet_state_gin' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_workspaces_sheet_state_gin ON public.workspaces USING GIN (sheet_state);
  END IF;
END $$;

COMMIT;



