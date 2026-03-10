-- Enable pgvector extension (must run BEFORE schema push)
-- Neon has pgvector pre-installed, this just enables it for the database.
-- Run this manually: psql $DATABASE_URL -f db/enable-pgvector.sql
-- Or execute via Neon dashboard SQL editor.

CREATE EXTENSION IF NOT EXISTS vector;
