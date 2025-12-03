-- Initial migration: Setup pgvector extension and fix column type
-- This migration ensures pgvector is properly configured

-- Enable pgvector extension (requires pgvector to be installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Check if memories table exists and alter the embedding column if needed
DO $$
BEGIN
  -- If the table doesn't exist, we'll create it with the full schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memories') THEN
    -- The full schema will be created by schema.sql
    RAISE NOTICE 'memories table does not exist, will be created by main schema';
  ELSE
    -- Table exists, check if embedding column needs to be fixed
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'memories' 
      AND column_name = 'embedding'
      AND data_type != 'USER-DEFINED'
    ) THEN
      -- Convert existing embedding column to vector type
      ALTER TABLE memories 
      ALTER COLUMN embedding TYPE vector(1536) 
      USING CASE 
        WHEN embedding IS NOT NULL THEN embedding::vector(1536)
        ELSE NULL
      END;
      
      RAISE NOTICE 'Updated embedding column to vector(1536) type';
    END IF;
  END IF;
END
$$;