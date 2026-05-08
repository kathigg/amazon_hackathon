---
inclusion: always
---

# CivicConnect — Project Steering

## What This Project Is
CivicConnect is a Next.js web platform that makes U.S. federal legislation accessible through:
- AI-generated plain-language bill summaries (Amazon Bedrock)
- Party stance comparisons + per-representative stance inference
- Civic action pathways (advocacy org matching, representative contact, scheduled email digests)

It is modeled on Bijak Memilih's card-based UI architecture, adapted for the American political system.

## Tech Stack
- **Framework**: Next.js 14 (App Router, server components)
- **Database**: PostgreSQL via Prisma ORM (Aurora / RDS in production, behind RDS Proxy)
- **AI**: Amazon Bedrock — current default `amazon.nova-micro-v1:0` for summaries, Claude on Bedrock for rep stance analysis (`lib/summarize.ts`, `lib/aws-bedrock.ts`)
- **Email**: Amazon SES (welcome + scheduled digests)
- **Data**: Congress.gov API (bills, votes), Google Civic Information API (rep lookup), local ZIP-to-district table
- **Styling**: Tailwind CSS with custom design tokens
- **Deployment**: Docker Compose (local) → ECS service `civic-connect-web` (production), CloudFront in front, EventBridge Scheduler for jobs. **Not Vercel** — `vercel.json` is reference only.

## Key Conventions
- All DB queries go through `lib/prisma.ts` singleton
- All external API calls are in `lib/` modules (congress.ts, votes.ts, summarize.ts)
- Pages are server components by default; only interactive UI uses `"use client"`
- All pages that query the DB use `export const dynamic = "force-dynamic"`
- Bill IDs follow the format: `{type}-{number}-{congress}` e.g. `hr-1234-119`
- Topic tags are inferred from bill titles via keyword matching in `lib/topics.ts`

## Environment Variables Required
```
CONGRESS_API_KEY       - api.congress.gov (free)
GOOGLE_CIVIC_API_KEY   - Google Cloud Console (IP restricted)
DATABASE_URL           - PostgreSQL connection string
INGEST_SECRET          - Any random string to protect /api/ingest
CRON_SECRET            - Protects scheduled-job endpoints
AWS_REGION             - us-east-1
AWS_BEDROCK_MODEL      - amazon.nova-micro-v1:0 (current default)
AWS_BEARER_TOKEN_BEDROCK or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
SES_FROM_EMAIL, SES_REPLY_TO
APP_BASE_URL
```

## Running Locally
```bash
cd civic-connect
docker compose up --build   # starts Postgres + app + runs prisma db push + ingests bills
```
Or without Docker:
```bash
cd civic-connect
npx prisma db push
npm run ingest
npm run dev
```
