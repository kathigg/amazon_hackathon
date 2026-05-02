#!/bin/sh
set -e

echo "Running database schema sync for local Docker..."
npx prisma db push --skip-generate

echo "Starting bill ingestion for local Docker..."
npm run ingest

echo "Starting app..."
exec node server.js
