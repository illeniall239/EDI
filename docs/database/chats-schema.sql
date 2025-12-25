-- Create the chats table for multiple chat functionality
-- Run this SQL in your Supabase dashboard to create the required table

CREATE TABLE chats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    messages JSONB DEFAULT '[]'::jsonb,
    context_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better performance
CREATE INDEX idx_chats_workspace_id ON chats(workspace_id);
CREATE INDEX idx_chats_updated_at ON chats(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your auth setup)
-- This assumes you have user authentication and workspace ownership setup

-- Allow users to see chats for workspaces they own
CREATE POLICY "Users can view their workspace chats" ON chats
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = chats.workspace_id 
            AND workspaces.user_id = auth.uid()
        )
    );

-- Allow users to insert chats for their workspaces
CREATE POLICY "Users can create chats for their workspaces" ON chats
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = chats.workspace_id 
            AND workspaces.user_id = auth.uid()
        )
    );

-- Allow users to update their workspace chats
CREATE POLICY "Users can update their workspace chats" ON chats
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = chats.workspace_id 
            AND workspaces.user_id = auth.uid()
        )
    );

-- Allow users to delete their workspace chats
CREATE POLICY "Users can delete their workspace chats" ON chats
    FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM workspaces 
            WHERE workspaces.id = chats.workspace_id 
            AND workspaces.user_id = auth.uid()
        )
    );

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_chats_updated_at_trigger
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_chats_updated_at();