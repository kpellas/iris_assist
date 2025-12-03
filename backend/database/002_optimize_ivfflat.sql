-- Migration: Optimize IVFFLAT index for production use
-- Run this migration after you have significant data (>10k vectors)

-- Check current row count
DO $$
DECLARE
  row_count INTEGER;
  list_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM memories WHERE embedding IS NOT NULL;
  
  IF row_count > 10000 THEN
    -- Calculate optimal list count (sqrt(rows) is a good starting point)
    list_count := GREATEST(100, LEAST(1000, FLOOR(SQRT(row_count))::INTEGER));
    
    RAISE NOTICE 'Optimizing IVFFLAT index for % vectors with % lists', row_count, list_count;
    
    -- Drop existing index
    DROP INDEX IF EXISTS idx_memories_embedding;
    
    -- Set optimization parameters for large index creation
    SET max_parallel_maintenance_workers = 7;
    SET maintenance_work_mem = '1GB';
    
    -- Create optimized index
    EXECUTE format('CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = %s)', list_count);
    
    -- Reset parameters
    RESET max_parallel_maintenance_workers;
    RESET maintenance_work_mem;
    
    RAISE NOTICE 'IVFFLAT index optimized successfully';
  ELSE
    RAISE NOTICE 'Skipping IVFFLAT optimization - only % vectors present (need >10000)', row_count;
  END IF;
END
$$;