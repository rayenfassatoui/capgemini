-- Migration: Add Full-Text Search infrastructure to cv_chunks
-- Phase 2 RAG: PostgreSQL FTS for lexical retrieval

-- Add tsvector column for full-text search
ALTER TABLE "cv_chunks" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "cv_chunks_search_vector_gin_idx" 
  ON "cv_chunks" USING gin ("search_vector");

-- Populate search_vector for existing chunks
UPDATE "cv_chunks" 
SET "search_vector" = to_tsvector('english', "chunk_text")
WHERE "search_vector" IS NULL;

-- Create trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION cv_chunks_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cv_chunks_search_vector_trigger ON "cv_chunks";

CREATE TRIGGER cv_chunks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "chunk_text"
  ON "cv_chunks"
  FOR EACH ROW
  EXECUTE FUNCTION cv_chunks_search_vector_update();

-- Add comment for documentation
COMMENT ON COLUMN "cv_chunks"."search_vector" IS 'PostgreSQL tsvector for full-text search, auto-updated via trigger';
