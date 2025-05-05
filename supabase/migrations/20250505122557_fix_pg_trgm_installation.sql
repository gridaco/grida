-- Drop the index that uses gin_trgm_ops
DROP INDEX IF EXISTS customer_search_text_trgm_idx;

-- Drop the extension from public schema
DROP EXTENSION IF EXISTS pg_trgm;

-- Create the extension in the correct schema
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Recreate the index
CREATE INDEX customer_search_text_trgm_idx ON customer USING GIN (search_text gin_trgm_ops);
