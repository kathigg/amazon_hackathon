# CivicConnect Project Handoff

This document is the primary handoff for a new software engineer, operator, or LLM agent joining the project. It is written so a collaborator can:

- understand what the system does
- understand which AWS services matter
- run the app locally
- deploy safely
- diagnose the common failure modes
- continue product and engineering work without reconstructing prior context

This repository is not a clean greenfield app. It has active production infrastructure, recent migrations, and several operational constraints. Read this document before making material changes.

## What CivicConnect is

CivicConnect is a federal legislation product that:

- ingests Congress.gov bill metadata
- generates plain-language bill summaries
- classifies bills into Library of Congress policy areas
- tracks bill popularity and personalized reading interest
- shows likely representative or senator positions on bills
- connects bills to relevant organizations
- sends welcome emails and scheduled bill digest emails

The product is not just a Next.js website. It is a web app plus scheduled jobs plus AWS-hosted infrastructure plus database-backed personalization.

## Non-negotiable production assumptions

These are hard rules:

- Production runtime is AWS, not Vercel.
- Production database path must be AWS-hosted Postgres/Aurora/RDS-compatible infrastructure.
- Production web hosting is ECS.
- Production AI path is Bedrock.
- Production email path is SES.
- Production geolocation and viewer headers come through CloudFront.
- Production jobs do not live only in the web process.

If you see instructions, code, or assumptions that imply:

- Neon is still the production database
- Vercel cron is the active scheduler
- image generation should happen on-request
- database repair logic should run inside health checks

assume that is stale or incorrect unless explicitly revalidated.

## Current system shape

### Web application

- Framework: Next.js App Router
- Deployment target: ECS Express / ECS-backed web service
- Main service name: `civic-connect-web`
- Purpose:
  - homepage
  - bill feed
  - bill detail pages
  - account/signup flows
  - organization browsing
  - representative lookup
  - email triggering for welcome flows

### Database

- ORM: Prisma
- Schema: [schema.prisma](/Users/kathleenhiggins/amazon_hackathon/civic-connect/prisma/schema.prisma)
- Main model families:
  - `Bill`
  - `Summary`
  - `Representative`
  - `RepStance`
  - `Organization`
  - `User`
  - `EmailDigestLog`
  - `BillView`

### Background work

- Bill ingestion
- taxonomy enrichment
- representative stance scraping/analysis
- digest dispatch

These jobs are expected to run outside the request path. If a feature is expensive, move it out of live page rendering.

### Image system

Current intended image architecture:

- real-world images only
- no AI-generated bill art
- deterministic selection by bill and category
- category assignment derived from LoC policy-area taxonomy
- image metadata persisted to `Bill.imageUrl`
- runtime prefers DB image URL and falls back to deterministic category mapping

The category mapping logic lives in:

- [bill-image-categories.ts](/Users/kathleenhiggins/amazon_hackathon/civic-connect/lib/bill-image-categories.ts)
- [topic-image-pool.ts](/Users/kathleenhiggins/amazon_hackathon/civic-connect/lib/topic-image-pool.ts)
- [backfill-bill-images.ts](/Users/kathleenhiggins/amazon_hackathon/civic-connect/scripts/backfill-bill-images.ts)

## Core AWS resources

These names matter because production commands and diagnosis often reference them directly.

### Compute

- ECS web service: `civic-connect-web`
- Lambda ingest job: `civic-ingest-job`
- Lambda digest job: `civic-account-digests-job`
- scraping jobs:
  - `civic-scrape-coordinator`
  - `civic-scrape-worker`

### Container registry

- ECR repository: `civic-connect-web`
- ECR repository: `civic-connect-jobs`

### Database and connection path

- Aurora / RDS-compatible cluster for app data
- RDS Proxy: `civic-connect-rds-proxy`

### Messaging and schedules

- EventBridge Scheduler for recurring jobs
- SQS queue(s) for scrape coordination

### External-facing infrastructure

- CloudFront in front of the web service
- SES for email sending
- Secrets Manager for secrets
- CloudWatch Logs for logs and health debugging

## Access model for collaborators

Do not share the AWS root account.

For a collaborator to work safely, give them:

### GitHub access

- Repo `Write` if they only need to code and push branches
- Repo `Maintain` if they also need branch/release admin workflows
- Repo `Admin` only if they need secrets/settings control

### AWS access

Prefer AWS IAM Identity Center / SSO or scoped IAM roles.

Minimum practical access for a senior engineer maintaining this app:

- ECS read/update
- ECR push/pull
- CloudWatch logs read
- Secrets Manager read for app secrets
- RDS / RDS Proxy read
- Lambda read/update/invoke if they maintain jobs
- Scheduler read/update if they maintain cron-like flows
- SES read or limited send configuration access
- CloudFront read/update if they maintain viewer-location setup

If a collaborator only needs app code and staging deployment, scope them narrower.

## Local development setup

### Prerequisites

- Node 20+
- npm
- Docker
- PostgreSQL access
- AWS CLI

### Install

```bash
cd /Users/kathleenhiggins/amazon_hackathon/civic-connect
npm install
```

### Environment

Start from:

- [.env.local.example](/Users/kathleenhiggins/amazon_hackathon/civic-connect/.env.local.example)

Minimum variables that commonly matter:

```env
DATABASE_URL=
CONGRESS_API_KEY=
GOOGLE_CIVIC_API_KEY=
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
APP_BASE_URL=http://localhost:3000
CRON_SECRET=
INGEST_SECRET=
SES_FROM_EMAIL=
SES_REPLY_TO=
```

Depending on auth path, local AI setup may also require:

```env
AWS_BEARER_TOKEN_BEDROCK=
```

or normal AWS credentials via CLI/SSO.

### Database sync

```bash
npx prisma db push
```

### Seed helpers

```bash
npm run seed:orgs
npm run seed:reps
```

### Ingest content

```bash
npm run ingest
```

### Run app

```bash
npm run dev
```

### Useful verification commands

```bash
npm run build
npm run test:db
npm run test:keys
```

## Repository map

### App routes

- `app/page.tsx`
  - homepage
- `app/bills/page.tsx`
  - bill feed
- `app/bill/[id]/page.tsx`
  - bill detail
- `app/account`
  - signup/login/preferences
- `app/api/*`
  - operational APIs and scheduled-job endpoints

### Important libraries

- `lib/prisma.ts`
  - DB client initialization
- `lib/bill-feed.ts`
  - feed query selection and hot/latest ranking
- `lib/bill-ingestion.ts`
  - ingestion update logic and guardrails
- `lib/congress.ts`
  - Congress.gov access
- `lib/summarize.ts`
  - summary generation
- `lib/rep-positions.ts`
  - representative stance reads
- `lib/account-digests.ts`
  - digest selection and rendering
- `lib/bill-image-categories.ts`
  - image category assignment

### Scripts

- `scripts/backfill-introduced-dates.ts`
- `scripts/backfill-policy-areas.ts`
- `scripts/backfill-bill-images.ts`
- `scripts/enrich-bill-tags.ts`
- `scripts/seed-orgs.ts`
- `scripts/seed-representatives.ts`

## Product-specific engineering rules

These are not generic style notes. They matter to the product itself.

### 1. Avoid expensive request-time work

Do not:

- fetch or generate images during page render
- perform heavy DB writes in health checks
- do broad representative analysis on the critical request path
- trigger ingestion work from ordinary page loads

Prefer:

- precomputed fields
- cached feed queries
- scheduled jobs
- persistent DB fields

### 2. Preserve personalization behavior

The account system is not optional product polish. It is part of core behavior.

Users should be able to:

- sign up
- pick issue preferences
- pick email frequency
- save ZIP code
- save preferred senators/representatives
- get personalized bill experience after signup

### 3. Dates are sensitive

`introducedAt` has already suffered data corruption. Treat all date rewrites as high risk.

If changing ingest:

- validate against official Congress.gov dates
- avoid placeholder/future timestamps
- do not overwrite sane historical dates with “updated now” values

### 4. Representative stance work is expensive

Stance collection and inference should stay incremental, cacheable, and mostly asynchronous.

### 5. Image policy is editorial

For bill images:

- use general issue imagery
- avoid portraits when possible
- use real-world images rather than synthetic art
- keep category assignment stable

## How to deploy the web app

### 1. Authenticate AWS

```bash
aws login --region us-east-1
aws sts get-caller-identity
```

### 2. Build locally first

```bash
npm run build
```

### 3. Log Docker into ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 712589718735.dkr.ecr.us-east-1.amazonaws.com
```

### 4. Build image

```bash
docker build --platform linux/amd64 -t 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag> .
```

### 5. Push image

```bash
docker push 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag>
```

### 6. Update ECS service

The service is updated by changing the ECS Express primary container image for `civic-connect-web`.

### 7. Validate rollout

At minimum:

- `/api/test`
- homepage
- `/bills`
- one bill page
- signup path
- any feature touched by the release

## Operational validation checklists

### After any web deploy

Check:

1. `https://www.civicconnect.net/api/test`
2. homepage renders
3. `/bills` renders
4. a bill page renders
5. no CSS/hydration regressions
6. no 504s
7. logs show healthy DB connectivity

### After account/email changes

Check:

1. signup works
2. preferences persist
3. welcome email path executes
4. digest route still works
5. SES credentials exist in runtime

### After ingestion changes

Check:

1. dates still match Congress.gov
2. topic tags still classify correctly
3. image fields are not blanked unexpectedly
4. background jobs are not spamming DB writes

## Common failure modes

### Homepage shows header, body spins, then 504

Likely causes:

- request path blocked on DB
- ECS task unhealthy or overloaded
- expensive render-path code

Start with:

- ECS CPU
- ECS logs
- `/api/test`
- bill feed query path

### CSS missing / HTML shell only

Likely causes:

- stale Next static asset mismatch across deploys
- mixed revision/static bundle issue

### Dates all look like “now”

Likely causes:

- ingest job writing placeholder current timestamps
- backfill not run after ingestion correction

### Emails not sending

Likely causes:

- missing SES runtime env
- missing task-role permissions
- sender identity not configured

### Images seem random or wrong

Likely causes:

- old revision still serving
- category manifest gaps
- fallback image being used because category pool is empty

## Git workflow recommendation

Suggested team workflow:

1. Keep `main` deployable.
2. Use short-lived feature branches.
3. Open PRs for anything risky.
4. Merge only after:
   - `npm run build`
   - relevant manual checks
   - AWS/runtime impact reviewed if infra touched

If a collaborator is actively deploying production, document the exact image tag and ECS revision in the PR or commit notes.

## What an LLM agent should know before editing

An LLM working on this repo should assume:

- production is AWS
- database regressions are high-risk
- the site has both web and scheduled-job behavior
- representative stance work and ingestion should stay off the request path
- image behavior must stay deterministic and cheap at runtime
- docs in this repo are part of the operating system, not optional extras

Before changing production-sensitive code, the agent should inspect:

- `README.md`
- this file
- `AWS_RUNTIME_SETUP.md`
- `AWS_CLOUDFRONT_GEOLOCATION.md`
- `prisma/schema.prisma`

## Immediate next docs to read

For a new teammate, read in this order:

1. [README.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/README.md)
2. [PROJECT_HANDOFF.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/PROJECT_HANDOFF.md)
3. [AWS_RUNTIME_SETUP.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/AWS_RUNTIME_SETUP.md)
4. [AWS_CLOUDFRONT_GEOLOCATION.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/AWS_CLOUDFRONT_GEOLOCATION.md)
5. [REAL_IMAGE_PIPELINE.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/REAL_IMAGE_PIPELINE.md)

