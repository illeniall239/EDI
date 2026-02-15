-- ============================================================================
-- Knowledge Base System - Database Migration Script
-- ============================================================================
-- This script creates all tables, indexes, RLS policies, and functions
-- required for the Knowledge Base system with document embeddings (pgvector)
-- ============================================================================

-- Enable pgvector extension for document embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Table 1: knowledge_bases
-- ============================================================================
-- Stores metadata for each knowledge base owned by users
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    embedding_model TEXT DEFAULT 'sentence-transformers/all-MiniLM-L6-v2',
    chunk_size INTEGER DEFAULT 1000,
    chunk_overlap INTEGER DEFAULT 200
);

-- Indexes for knowledge_bases
CREATE INDEX IF NOT EXISTS idx_kb_user_id ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_kb_updated_at ON knowledge_bases(updated_at DESC);

-- RLS for knowledge_bases
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own knowledge bases" ON knowledge_bases;
CREATE POLICY "Users can view own knowledge bases" ON knowledge_bases
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own knowledge bases" ON knowledge_bases;
CREATE POLICY "Users can create own knowledge bases" ON knowledge_bases
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own knowledge bases" ON knowledge_bases;
CREATE POLICY "Users can update own knowledge bases" ON knowledge_bases
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own knowledge bases" ON knowledge_bases;
CREATE POLICY "Users can delete own knowledge bases" ON knowledge_bases
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- Table 2: kb_documents
-- ============================================================================
-- Stores metadata for uploaded unstructured documents (PDFs, DOCX, TXT)
CREATE TABLE IF NOT EXISTS kb_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf', 'docx', 'txt'
    file_size_bytes BIGINT,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    page_count INTEGER,
    total_chunks INTEGER,
    has_tables BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for kb_documents
CREATE INDEX IF NOT EXISTS idx_kb_docs_kb_id ON kb_documents(kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_status ON kb_documents(processing_status);

-- RLS for kb_documents
ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view KB documents" ON kb_documents;
CREATE POLICY "Users can view KB documents" ON kb_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_documents.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert KB documents" ON kb_documents;
CREATE POLICY "Users can insert KB documents" ON kb_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_documents.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update KB documents" ON kb_documents;
CREATE POLICY "Users can update KB documents" ON kb_documents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_documents.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete KB documents" ON kb_documents;
CREATE POLICY "Users can delete KB documents" ON kb_documents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_documents.kb_id AND kb.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Table 3: kb_document_chunks
-- ============================================================================
-- Stores text chunks with vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS kb_document_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384), -- all-MiniLM-L6-v2 produces 384-dimensional vectors
    chunk_metadata JSONB DEFAULT '{}'::jsonb, -- Store page_num, section, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes for kb_document_chunks
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_id ON kb_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON kb_document_chunks(kb_id);

-- IVFFlat index for fast vector similarity search (cosine distance)
-- This significantly improves query performance for embeddings
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON kb_document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS for kb_document_chunks
ALTER TABLE kb_document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view KB chunks" ON kb_document_chunks;
CREATE POLICY "Users can view KB chunks" ON kb_document_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_document_chunks.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert KB chunks" ON kb_document_chunks;
CREATE POLICY "Users can insert KB chunks" ON kb_document_chunks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_document_chunks.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete KB chunks" ON kb_document_chunks;
CREATE POLICY "Users can delete KB chunks" ON kb_document_chunks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_document_chunks.kb_id AND kb.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Table 4: kb_structured_data
-- ============================================================================
-- Tracks structured data files (CSV, Excel) uploaded to knowledge bases
CREATE TABLE IF NOT EXISTS kb_structured_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'csv', 'xlsx'
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    row_count INTEGER,
    column_count INTEGER,
    column_names TEXT[],
    data_preview JSONB, -- First 5 rows for quick preview
    temp_db_path TEXT, -- Path to temporary SQLite database
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for kb_structured_data
CREATE INDEX IF NOT EXISTS idx_kb_struct_kb_id ON kb_structured_data(kb_id);

-- RLS for kb_structured_data
ALTER TABLE kb_structured_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage KB structured data" ON kb_structured_data;
CREATE POLICY "Users can manage KB structured data" ON kb_structured_data
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_structured_data.kb_id AND kb.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Table 5: kb_extracted_tables
-- ============================================================================
-- Stores tables extracted from PDF/DOCX documents for predictive analytics
CREATE TABLE IF NOT EXISTS kb_extracted_tables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    page_number INTEGER,
    table_index INTEGER, -- Multiple tables can exist on same page
    table_data JSONB NOT NULL, -- Array of row objects
    column_names TEXT[],
    row_count INTEGER,
    temp_db_path TEXT, -- SQLite DB for running predictions on this table
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes for kb_extracted_tables
CREATE INDEX IF NOT EXISTS idx_kb_extracted_kb_id ON kb_extracted_tables(kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_extracted_doc_id ON kb_extracted_tables(document_id);

-- RLS for kb_extracted_tables
ALTER TABLE kb_extracted_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view KB extracted tables" ON kb_extracted_tables;
CREATE POLICY "Users can view KB extracted tables" ON kb_extracted_tables
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_extracted_tables.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert KB extracted tables" ON kb_extracted_tables;
CREATE POLICY "Users can insert KB extracted tables" ON kb_extracted_tables
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_extracted_tables.kb_id AND kb.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete KB extracted tables" ON kb_extracted_tables;
CREATE POLICY "Users can delete KB extracted tables" ON kb_extracted_tables
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM knowledge_bases kb
            WHERE kb.id = kb_extracted_tables.kb_id AND kb.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Table 6: Update chats table for KB support
-- ============================================================================
-- Add kb_id column to existing chats table (nullable for backward compatibility)
ALTER TABLE chats ADD COLUMN IF NOT EXISTS kb_id UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE;

-- Add constraint: either workspace_id OR kb_id must be set (not both, not neither)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chats_parent_check' AND conrelid = 'chats'::regclass
    ) THEN
        ALTER TABLE chats ADD CONSTRAINT chats_parent_check
            CHECK (
                (workspace_id IS NOT NULL AND kb_id IS NULL) OR
                (workspace_id IS NULL AND kb_id IS NOT NULL)
            );
    END IF;
END $$;

-- Add index on kb_id
CREATE INDEX IF NOT EXISTS idx_chats_kb_id ON chats(kb_id);

-- Update RLS policies to handle both workspace and KB chats
DROP POLICY IF EXISTS "Users can view their workspace chats" ON chats;
DROP POLICY IF EXISTS "Users can view their chats" ON chats;

CREATE POLICY "Users can view their chats" ON chats
    FOR SELECT USING (
        (workspace_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM workspaces
            WHERE workspaces.id = chats.workspace_id
            AND workspaces.user_id = auth.uid()
        )) OR
        (kb_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM knowledge_bases
            WHERE knowledge_bases.id = chats.kb_id
            AND knowledge_bases.user_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "Users can insert their chats" ON chats;
CREATE POLICY "Users can insert their chats" ON chats
    FOR INSERT WITH CHECK (
        (workspace_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM workspaces
            WHERE workspaces.id = chats.workspace_id
            AND workspaces.user_id = auth.uid()
        )) OR
        (kb_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM knowledge_bases
            WHERE knowledge_bases.id = chats.kb_id
            AND knowledge_bases.user_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "Users can update their chats" ON chats;
CREATE POLICY "Users can update their chats" ON chats
    FOR UPDATE USING (
        (workspace_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM workspaces
            WHERE workspaces.id = chats.workspace_id
            AND workspaces.user_id = auth.uid()
        )) OR
        (kb_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM knowledge_bases
            WHERE knowledge_bases.id = chats.kb_id
            AND knowledge_bases.user_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "Users can delete their chats" ON chats;
CREATE POLICY "Users can delete their chats" ON chats
    FOR DELETE USING (
        (workspace_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM workspaces
            WHERE workspaces.id = chats.workspace_id
            AND workspaces.user_id = auth.uid()
        )) OR
        (kb_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM knowledge_bases
            WHERE knowledge_bases.id = chats.kb_id
            AND knowledge_bases.user_id = auth.uid()
        ))
    );

-- ============================================================================
-- Function: match_kb_documents (Vector Similarity Search)
-- ============================================================================
-- This function performs vector similarity search using pgvector
-- Returns top-k most similar document chunks based on cosine similarity
CREATE OR REPLACE FUNCTION match_kb_documents(
  query_embedding vector(384),
  kb_id_param uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb_document_chunks.id,
    kb_document_chunks.document_id,
    kb_document_chunks.content,
    kb_document_chunks.chunk_metadata,
    1 - (kb_document_chunks.embedding <=> query_embedding) AS similarity
  FROM kb_document_chunks
  WHERE kb_document_chunks.kb_id = kb_id_param
  ORDER BY kb_document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Trigger: Auto-update updated_at timestamp for knowledge_bases
-- ============================================================================
-- Reuse existing trigger function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_kb_updated_at ON knowledge_bases;
CREATE TRIGGER update_kb_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Verification Queries (Run these to verify successful migration)
-- ============================================================================

-- Uncomment to verify table creation
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'kb_%';

-- Uncomment to verify pgvector extension
-- SELECT * FROM pg_extension WHERE extname = 'vector';

-- Uncomment to verify RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'kb_%';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- All tables, indexes, RLS policies, and functions have been created.
-- You can now proceed with Phase 2: Document Processing Backend
-- ============================================================================
