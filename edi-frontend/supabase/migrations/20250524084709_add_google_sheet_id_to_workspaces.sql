-- Add google_sheet_id column to workspaces table
ALTER TABLE workspaces 
ADD COLUMN google_sheet_id TEXT;
