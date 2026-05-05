# Real Image Pipeline (No AI/Synthetic)

## Goal
- Use real-world photos only.
- Keep runtime fast (no request-time image search/generation).
- Keep deterministic image assignment per bill.

## Architecture
1. Build a topic photo pool offline (batch job).
2. Store approved image URLs/metadata in a catalog.
3. Deterministically select image with `hash(billId + topic)`.
4. Serve images via static/CDN URL only.

## Current repo pieces
- Synthetic/illustration rejection in Openverse filtering:
  - `lib/openverse.ts`
- Offline pool builder script:
  - `scripts/build-topic-photo-pool.ts`

## How to run
```bash
cd /Users/kathleenhiggins/amazon_hackathon/civic-connect
npx tsx scripts/build-topic-photo-pool.ts
```

The script writes:
- `public/topic-images-real/manifest.json`
- `public/topic-images-real/<topic>/<topic>-N.json`

These JSON files contain approved real-photo metadata candidates.

## AWS options
- There is no single first-party "Amazon stock image database API" equivalent to Shutterstock/Getty for this use case.
- Fast AWS-native production pattern:
  1. Curate/import licensed images into S3.
  2. Serve with CloudFront.
  3. Keep topic->asset metadata in DB (or manifest).
  4. Deterministic selection in app.
- Optional quality gate:
  - Use Rekognition `DetectLabels` offline on imports to reject non-photo assets and low-relevance images.

## Why this is fast
- No request-time external API calls for images.
- No server-side image transforms required.
- CDN serves static files; app does O(1) lookup only.
