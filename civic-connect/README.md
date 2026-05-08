# CivicConnect

Plain-language federal bill coverage with personalized reading desks, representative stance tracking, advocacy organization matching, and scheduled email briefs.

## Stack

- Next.js App Router
- Prisma + PostgreSQL
- Amazon Bedrock for summaries, taxonomy enrichment, and representative stance analysis
- Amazon SES for transactional and digest email
- Congress.gov API for bill data
- Google Civic Information API plus local ZIP-to-district data for representative lookup
- AWS ECS + Aurora PostgreSQL + CloudFront in production

## Important deployment rule

Use AWS infrastructure for production runtime and data services.

- Production database: Aurora PostgreSQL / RDS-compatible Postgres
- Production app runtime: ECS
- Production email: SES
- Production AI: Bedrock
- Production geolocation headers: CloudFront

Do not assume Neon is the target database for this project.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with the variables below.

3. Point `DATABASE_URL` at a local or shared PostgreSQL instance, then sync Prisma:

```bash
npx prisma db push
```

4. Seed supporting data as needed:

```bash
npm run seed:orgs
npm run seed:reps
```

5. Pull recent bills and generate summaries:

```bash
npm run ingest
```

6. Start the app:

```bash
npm run dev
```

## Core environment variables

```env
DATABASE_URL=
CONGRESS_API_KEY=
GOOGLE_CIVIC_API_KEY=

AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.nova-micro-v1:0
SES_FROM_EMAIL=
SES_REPLY_TO=

APP_BASE_URL=https://www.civicconnect.net
CRON_SECRET=
INGEST_SECRET=
```

## Scheduled jobs

These routes are expected to run on a schedule:

- `/api/ingest`
  Refreshes bill metadata and summaries.
- `/api/account/digests`
  Should run hourly. It checks each user timezone and sends:
  - welcome confirmation immediately after signup
  - next-morning onboarding brief at 9am local time
  - daily briefs at 9am local time if selected
  - weekly briefs at 9am local time on Monday if selected
- `/api/scrape/representatives`
  Refreshes representative position evidence in incremental batches.

The repo includes `vercel.json` cron entries for reference. In AWS, mirror those schedules with EventBridge Scheduler or an equivalent job runner.

## Representative and location flow

- Signed-in users can save a ZIP code and preferred senators / House members.
- Signed-out users can still save preferred members through the contact page using the browser-linked user profile cookie.
- Bill pages pin saved members first in Auto-Whip.
- CloudFront viewer headers can prefill location-aware representatives before ZIP entry.

For the AWS-side setup, read [AWS_CLOUDFRONT_GEOLOCATION.md](./AWS_CLOUDFRONT_GEOLOCATION.md).

## Repository docs for engineers

- [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)
- [LLM_CONTEXT.md](./LLM_CONTEXT.md)
- [AWS_ONBOARDING.md](./AWS_ONBOARDING.md)
- [AWS_RUNTIME_SETUP.md](./AWS_RUNTIME_SETUP.md)
- [AWS_ECS_MIGRATION.md](./AWS_ECS_MIGRATION.md)
- [AWS_BEDROCK_SETUP.md](./AWS_BEDROCK_SETUP.md)
- [AWS_CLOUDFRONT_GEOLOCATION.md](./AWS_CLOUDFRONT_GEOLOCATION.md)
- [BRANDING_DIRECTIONS.md](./BRANDING_DIRECTIONS.md)

## First read for a new collaborator

If you are joining the project fresh, read these in order:

1. [README.md](./README.md)
2. [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)
3. [AWS_ONBOARDING.md](./AWS_ONBOARDING.md)
4. [AWS_RUNTIME_SETUP.md](./AWS_RUNTIME_SETUP.md)
5. [AWS_CLOUDFRONT_GEOLOCATION.md](./AWS_CLOUDFRONT_GEOLOCATION.md)
6. [LLM_CONTEXT.md](./LLM_CONTEXT.md)

## Useful scripts

```bash
npm run dev
npm run build
npm run ingest
npm run seed:orgs
npm run seed:reps
npm run backfill:dates
npm run backfill:taxonomy
npm run enrich:tags
```

## Product notes

- `components/CivicConnectMark.tsx` is the current abstract brand mark.
- Bill imagery should stay issue-based and general, not portrait-heavy.
- Organization matching targets up to 3 groups per bill.
- Auto-Whip shows support, opposition, and no-position members for the currently relevant chamber.
