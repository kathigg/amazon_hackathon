-- Idempotent setup for the Bill full-text search column.
--
-- `prisma db push` will create a plain tsvector column for the
-- `searchVector Unsupported("tsvector")?` field declared in schema.prisma.
-- This script replaces it with a generated tsvector populated from
-- title (weight A) and sponsor (weight B), and adds the GIN index used
-- by lib/bill-search.ts.
--
-- Run after `prisma db push` (and any time the generation expression changes):
--   npm run setup:search

DROP INDEX IF EXISTS "bill_search_vector_idx";
ALTER TABLE "Bill" DROP COLUMN IF EXISTS "search_vector";

ALTER TABLE "Bill"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("sponsor", '')), 'B')
  ) STORED;

CREATE INDEX "bill_search_vector_idx" ON "Bill" USING gin ("search_vector");
