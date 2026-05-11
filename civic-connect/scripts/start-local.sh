#!/bin/sh
set -e

echo "Running database schema sync for local Docker..."
npx prisma db push --skip-generate

echo "Installing FTS search_vector (generated column + GIN index)..."
npm run setup:search

echo "Starting bill ingestion for local Docker..."
npm run ingest

echo "Starting app..."
exec node server.js
