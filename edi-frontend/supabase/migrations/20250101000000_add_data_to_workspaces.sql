-- Add data storage columns to workspaces table
ALTER TABLE workspaces 
ADD COLUMN data JSONB,
ADD COLUMN filename TEXT,
ADD COLUMN column_order TEXT[], -- Store original column order
ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index on last_modified for performance
CREATE INDEX idx_workspaces_last_modified ON workspaces (last_modified);

-- Create function to update last_modified automatically
CREATE OR REPLACE FUNCTION update_workspace_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update last_modified
CREATE TRIGGER update_workspaces_last_modified
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_last_modified(); 