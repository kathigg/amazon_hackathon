#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --skip-generate

echo "Starting bill ingestion..."
npm run ingest

echo "Starting app..."
exec node server.js
