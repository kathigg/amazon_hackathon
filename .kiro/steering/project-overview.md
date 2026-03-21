---
inclusion: always
---

# CivicConnect — Project Steering

## What This Project Is
CivicConnect is a Next.js web platform that makes U.S. federal legislation accessible through:
- AI-generated plain-language bill summaries (Google Gemini)
- Party stance comparisons (Democrat vs Republican vote breakdowns)
- Civic action pathways (advocacy org matching, representative contact)

It is modeled on Bijak Memilih's card-based UI architecture, adapted for the American political system.

## Tech Stack
- **Framework**: Next.js 14 (App Router, server components)
- **Database**: PostgreSQL via Prisma ORM
- **AI**: Google Gemini 1.5 Flash (`@google/generative-ai`)
- **Data**: Congress.gov API (bills, votes), Google Civic Information API (rep lookup)
- **Styling**: Tailwind CSS with custom design tokens
- **Deployment**: Docker Compose (local), Vercel (production)

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
GOOGLE_GEMINI_KEY      - Google AI Studio (free tier)
GOOGLE_CIVIC_API_KEY   - Google Cloud Console (IP restricted)
DATABASE_URL           - PostgreSQL connection string
INGEST_SECRET          - Any random string to protect /api/ingest
```

## Running Locally
```bash
docker compose up --build   # starts Postgres + app + runs migrations + ingests bills
```
Or without Docker:
```bash
npx prisma db push
npm run ingest
npm run dev
```
