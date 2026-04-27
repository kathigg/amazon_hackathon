#!/bin/bash
# Run this once after first Vercel deployment to populate the database

echo "Pushing database schema..."
npx prisma db push --accept-data-loss

echo "Database ready. Now trigger /api/ingest manually with:"
echo "curl -X POST https://your-vercel-url.vercel.app/api/ingest -H 'x-ingest-secret: YOUR_SECRET'"
