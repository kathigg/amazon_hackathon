# LLM Context

This file is the shortest possible high-signal context for another LLM or automation agent picking up work in this repository.

## Mission

Maintain and extend CivicConnect, a federal legislation product with:

- bill ingestion
- plain-language summaries
- taxonomy classification
- representative stance analysis
- organization matching
- account personalization
- welcome + digest emails

## Production truth

- Runtime: AWS
- Web: ECS
- Database: AWS-hosted Postgres / Aurora / RDS-compatible path
- Email: SES
- AI: Bedrock
- Viewer location: CloudFront headers

Do not assume:

- Vercel is the active production runtime
- Neon is the production DB
- cron jobs run only inside the web server

## Core risk areas

High-risk code paths:

- database writes in hot request paths
- ingestion date logic
- representative stance scraping/inference
- email dispatch runtime permissions
- static asset/deployment mismatches

## Product rules

- users should get a personalized experience after signup
- ZIP and preferred representative selection matter
- bill summaries should remain plain-language but formal enough for general readership
- images should be general real-world issue imagery, not portrait-heavy and not AI-generated
- runtime image selection should be deterministic and cheap

## Current image architecture

- taxonomy term -> high-level category
- high-level category -> pooled real image URLs
- deterministic assignment by `hash(billId + category)`
- persisted to `Bill.imageUrl`
- runtime prefers DB value and falls back to deterministic category mapping

Important files:

- [bill-image-categories.ts](./lib/bill-image-categories.ts)
- [topic-image-pool.ts](./lib/topic-image-pool.ts)
- [backfill-bill-images.ts](./scripts/backfill-bill-images.ts)

## Files to inspect before major changes

1. [README.md](./README.md)
2. [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)
3. [schema.prisma](./prisma/schema.prisma)
4. [AWS_RUNTIME_SETUP.md](./AWS_RUNTIME_SETUP.md)
5. [AWS_CLOUDFRONT_GEOLOCATION.md](./AWS_CLOUDFRONT_GEOLOCATION.md)

## Expected validation baseline

Before claiming a production-sensitive change is complete:

- `npm run build` passes
- `/api/test` is healthy
- homepage renders
- `/bills` renders
- at least one bill page renders
- if touching account/email, validate account creation and digest path

## If you are unsure

Bias toward:

- preserving working AWS assumptions
- moving heavy work into scheduled/offline paths
- using explicit docs in-repo rather than inference from stale history

