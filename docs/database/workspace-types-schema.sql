-- Workspace Types System Schema
-- This file contains the database schema changes needed for the workspace types implementation

-- Add workspace_type field to existing workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(20) DEFAULT 'work';
ALTER TABLE workspaces ADD CONSTRAINT workspace_type_check
  CHECK (workspace_type IN ('work', 'learn'));

-- Add description field to workspaces (if it doesn't exist)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT;

-- Create learning progress tracking table (Learn mode only)
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  concept_id VARCHAR(50) NOT NULL,
  skill_level VARCHAR(20) NOT NULL CHECK (skill_level IN ('novice', 'practicing', 'proficient', 'mastered')),
  attempts_count INTEGER DEFAULT 0,
  mastery_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create learning datasets table (curated educational data)
CREATE TABLE IF NOT EXISTS learning_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  concept_category VARCHAR(50) NOT NULL, -- 'basic_functions', 'lookups', 'data_analysis', etc.
  difficulty_level VARCHAR(20) NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  prerequisites TEXT[], -- array of prerequisite concept_ids
  dataset_json JSONB NOT NULL,
  instructions TEXT[],
  learning_objectives TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_progress_workspace_id ON learning_progress(workspace_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_concept_id ON learning_progress(concept_id);
CREATE INDEX IF NOT EXISTS idx_learning_datasets_category ON learning_datasets(concept_category);
CREATE INDEX IF NOT EXISTS idx_learning_datasets_difficulty ON learning_datasets(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_workspaces_type ON workspaces(workspace_type);

-- Insert some initial learning datasets
INSERT INTO learning_datasets (name, concept_category, difficulty_level, prerequisites, dataset_json, instructions, learning_objectives)
VALUES
(
  'Basic Functions Tutorial',
  'basic_functions',
  'beginner',
  '{}',
  '[
    {"Name": "Alice", "Age": 28, "Salary": 50000, "Department": "Sales"},
    {"Name": "Bob", "Age": 34, "Salary": 75000, "Department": "Engineering"},
    {"Name": "Carol", "Age": 29, "Salary": 60000, "Department": "Marketing"},
    {"Name": "David", "Age": 41, "Salary": 90000, "Department": "Engineering"},
    {"Name": "Eve", "Age": 25, "Salary": 45000, "Department": "Sales"}
  ]',
  '{
    "Practice using SUM to calculate total salaries",
    "Use AVERAGE to find the mean age",
    "Try COUNT to count employees by department",
    "Experiment with MIN and MAX functions"
  }',
  '{
    "Understand basic spreadsheet functions",
    "Learn SUM, AVERAGE, COUNT, MIN, MAX",
    "Practice function syntax and cell references"
  }'
),
(
  'VLOOKUP Fundamentals',
  'lookups',
  'intermediate',
  '{"basic_functions"}',
  '[
    {"Product_ID": "P001", "Product_Name": "Laptop", "Category": "Electronics", "Price": 999.99},
    {"Product_ID": "P002", "Product_Name": "Chair", "Category": "Furniture", "Price": 149.99},
    {"Product_ID": "P003", "Product_Name": "Book", "Category": "Education", "Price": 29.99},
    {"Product_ID": "P004", "Product_Name": "Phone", "Category": "Electronics", "Price": 599.99}
  ]',
  '{
    "Create a lookup table to find product names by ID",
    "Practice exact match lookups",
    "Try approximate match lookups with sorted data",
    "Handle #N/A errors with IFERROR"
  }',
  '{
    "Master VLOOKUP syntax and parameters",
    "Understand exact vs approximate matching",
    "Learn error handling in lookup formulas"
  }'
)
ON CONFLICT DO NOTHING;