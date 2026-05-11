# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git root (`/home/cche/projects/amazon_hackathon/`) holds high-level docs and the `.kiro/` Kiro spec/steering folder. **All application code lives in `civic-connect/`** — `cd civic-connect` before running any `npm` command. There is a top-level `README.md` describing the original hackathon submission and a separate `civic-connect/README.md` that supersedes it for current operational guidance.

Authoritative docs (read in this order before non-trivial changes):

1. `civic-connect/README.md`
2. `civic-connect/PROJECT_HANDOFF.md`
3. `civic-connect/LLM_CONTEXT.md`
4. `civic-connect/AWS_RUNTIME_SETUP.md`
5. `civic-connect/AWS_CLOUDFRONT_GEOLOCATION.md`
6. `civic-connect/prisma/schema.prisma`

Treat `LLM_CONTEXT.md` and `PROJECT_HANDOFF.md` as the source of truth for production assumptions. The top-level `README.md`, `.kiro/steering/*.md`, and `AWS_BEDROCK_SETUP.md` predate the AWS migration and contain stale references to Vercel and Google Gemini — see the "Stale doc warnings" section below.

Operational runbooks at the repo root (not in `civic-connect/`):

- `AWS_ONBOARDING.md` — day-one teammate runbook: AWS access, named resources, first-deploy walkthrough.
- `AWS_LOCAL_DB_MIRROR.md` — pull a real prod DB dump via temporary SSM bastion, point `npm run dev` at it, diff repo against the running prod image.
- `AWS_PROD_REDEPLOY.md` — push recent code to ECS (build → ECR → schema migrate → service update) and destructively replace the prod DB from the local `civic-mirror-db` container.

## Common commands

All from inside `civic-connect/`:

```bash
npm run dev                  # start Next.js dev server (localhost:3000)
npm run build                # prisma generate + next build (must pass before deploys)
npm run lint                 # next lint
npx prisma db push           # sync schema (no migration history)
npm run setup:search         # apply prisma/sql/bill_search_vector.sql (Postgres FTS column + trigger)
npm run ingest               # pull bills from Congress.gov + generate Bedrock summaries
npm run seed:orgs            # load advocacy orgs
npm run seed:reps            # load representative directory
npm run backfill:dates       # repair Bill.introducedAt
npm run backfill:taxonomy    # backfill LoC policy areas
npm run backfill:progress    # backfill Bill.progressStage from latestActionText
npm run backfill:summaries   # regenerate missing/placeholder Bedrock summaries
npm run enrich:tags          # LLM topic-tag enrichment
npm run discover:subjects    # discover legislativeSubjects → image-pool category keys
npm run curate:images        # populate BillImageAsset pool (Wikimedia Commons + Openverse → S3)
npm run backfill:bill-images # assign curated BillImageAsset to existing bills
npm run regenerate:images    # regenerate Bill.imageUrl deterministic fallbacks
npm run backfill:images      # legacy: backfill Bill.imageUrl directly
npm run test:db              # smoke-test DATABASE_URL connectivity
npm run test:keys            # smoke-test external API keys
```

There is no test runner configured — validation is build + manual verification (see "Validation baseline" below).

Local Docker stack (Postgres + app, runs `prisma db push` then `npm run ingest` on first boot):

```bash
docker compose up --build    # from civic-connect/
```

## Local production mirror

Run the actual prod ECR image against a local Postgres, with prod secrets pulled from Secrets Manager. Use this to reproduce prod-only bugs without touching the live cluster. Two long-running containers, no compose (the host may not have `docker compose` v2):

- `civic-mirror-db` — `postgres:17-alpine`, host port **5433**, ephemeral (no volume mount). Must match Aurora's major version (17) — PG16 cannot read a custom-format dump produced by a PG17 client.
- `civic-mirror-app` — exact prod ECR image, host port **3001** (avoids clashing with `npm run dev` on 3000).
- Both attached to docker network `civic-mirror`.
- App env loaded from `civic-connect/.env.prod-mirror` (gitignored).

### One-time setup

1. `aws sts get-caller-identity` to confirm auth (account `712589718735`).
2. Find the running image tag:
   ```bash
   aws ecs describe-services --cluster default --services civic-connect-web --region us-east-1 \
     --query 'services[0].deployments[0].taskDefinition' --output text
   aws ecs describe-task-definition --task-definition <task-def-arn> --region us-east-1 \
     --query 'taskDefinition.containerDefinitions[0].{image:image,environment:environment,secrets:secrets}'
   ```
3. `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 712589718735.dkr.ecr.us-east-1.amazonaws.com && docker pull <image>`
4. Create `civic-connect/.env.prod-mirror`. Copy non-secret `environment` from the task def, override `DATABASE_URL` to the local Postgres, **omit `DATABASE_OWNER_*`** (real-Aurora only). Fetch each secret via shell redirection so values never land in the transcript:
   ```bash
   printf 'CONGRESS_API_KEY=%s\n' "$(aws secretsmanager get-secret-value \
     --secret-id <full-secret-arn> --region us-east-1 --query SecretString --output text)" \
     >> civic-connect/.env.prod-mirror
   ```
   Required keys: `DATABASE_URL`, `CONGRESS_API_KEY`, `GOOGLE_CIVIC_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, `INGEST_SECRET`, `CRON_SECRET`. The local `DATABASE_URL` value is `postgresql://postgres:postgres@civic-mirror-db:5432/civicconnect?schema=public`.
   **Never `cat` or `Read` `.env.prod-mirror` through a tool whose output goes to chat — that leaks the secrets you just fetched into the transcript.** Use `awk -F= '/^[A-Z]/{print $1, (length($0)>length($1)+1?"set":"EMPTY")}'` to verify keys without exposing values.

### Boot

```bash
docker network create civic-mirror
docker run -d --name civic-mirror-db --network civic-mirror \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=civicconnect \
  -p 5433:5432 postgres:17-alpine
until docker exec civic-mirror-db pg_isready -U postgres -q; do sleep 1; done
docker run -d --name civic-mirror-app --network civic-mirror \
  -p 3001:3000 --env-file civic-connect/.env.prod-mirror \
  --entrypoint sh \
  712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag> \
  -c "npx prisma db push --skip-generate --accept-data-loss && npm run setup:search && (npm run ingest || true) && exec node server.js"
```

The prod image's CMD is just `node server.js` — it does **not** run `prisma db push`, `npm run setup:search`, or `npm run ingest`. The entrypoint override bootstraps all three on first boot, so the homepage, `/bills`, and bill search are non-empty. `setup:search` is required: `prisma db push` only creates a plain nullable `tsvector` column, so without `setup:search` the `search_vector` is `NULL` on every row and `/bills?q=…` silently returns zero results.

### Check the database

```bash
docker exec -it civic-mirror-db psql -U postgres -d civicconnect
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc 'SELECT COUNT(*) FROM "Bill"'
docker exec civic-mirror-db psql -U postgres -d civicconnect -c '\dt'
```

### Test URLs

```bash
curl -sS http://localhost:3001/api/health         # status: ok, database: connected
curl -sS http://localhost:3001/api/test           # env presence flags
curl -sS 'http://localhost:3001/api/bills?limit=1'
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3001/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3001/bills
docker logs -f civic-mirror-app
```

### Refresh / tear down

```bash
docker exec civic-mirror-app npm run ingest                    # add more recent bills
docker restart civic-mirror-app                                # restart app only
docker rm -f civic-mirror-app civic-mirror-db                  # full tear down
docker network rm civic-mirror
```

### Caveats

- Bedrock and Congress.gov calls hit real upstream services — Bedrock means real billing.
- SES is intentionally unset; no email will actually send.
- Local DB is ephemeral; every tear-down drops all rows.
- The boot flow above seeds the mirror with `prisma db push` + `npm run ingest` — synthetic data, **no real users**. To get real prod rows (Bills, Reps, Users, Sessions, etc.), see `AWS_LOCAL_DB_MIRROR.md` at the repo root, which covers (1) dumping prod via a temporary SSM bastion, (2) wiring `npm run dev` to the dump, and (3) diffing local source against the running prod image.

## Production runtime (do NOT assume Vercel)

Production is **AWS**, not Vercel. Even though `civic-connect/vercel.json` exists with cron entries, those are reference schedules — production schedules run via EventBridge Scheduler triggering Lambda jobs. Do not propose Vercel-specific solutions.

| Concern | Production service |
|---|---|
| Web runtime | ECS service `civic-connect-web` (image from ECR repo `civic-connect-web`) |
| Database | Aurora / RDS-compatible Postgres behind RDS Proxy `civic-connect-rds-proxy` |
| AI inference | Amazon Bedrock (default model in code: `amazon.nova-micro-v1:0`; switched from Claude Haiku 4.5 — see recent commit history) |
| Email | Amazon SES |
| Geolocation | CloudFront viewer headers prefill location-aware reps before ZIP entry |
| Background jobs | Lambdas: `civic-ingest-job`, `civic-account-digests-job`, `civic-scrape-coordinator`, `civic-scrape-worker`, scheduled by EventBridge |
| Secrets | AWS Secrets Manager |
| Logs | CloudWatch Logs |
| Region | `us-east-1` |

Deploy = `docker build --platform linux/amd64`, push to ECR, update the ECS service primary container image. After any deploy, hit `/api/test`, homepage, `/bills`, one bill page, and any feature touched by the change.

## Architecture (civic-connect/)

Next.js 14 App Router with server components by default, Prisma + PostgreSQL, Tailwind CSS.

```
app/
  page.tsx                      home feed (server)
  bills/                        bill list
  bill/[id]/                    bill detail + contact-rep flow
  account/                      signup/login/preferences (cookie-based User)
  orgs/, orgs/register/         org directory
  api/
    ingest/                     bill ingestion endpoint (x-ingest-secret header required)
    account/digests/            hourly digest dispatcher (welcome + daily/weekly briefs)
    scrape/representatives/     incremental rep stance scraping
    bills/, orgs/, reps/, events/, bill-image/, analytics/, health/, test/
components/                     UI primitives (IssueCard, StanceCard, ActionCard, etc.)
lib/
  prisma.ts                     singleton Prisma client — all DB access goes through this
  congress.ts                   Congress.gov client
  summarize.ts                  Bedrock-backed bill summarization (forced tool-use, schema-validated)
  aws-bedrock.ts                Bedrock stance analysis (Converse API)
  bedrock-structured.ts         shared Bedrock structured-output helper
  bill-feed.ts                  hot/latest ranking and feed selection
  bill-search.ts                Postgres FTS query parser + ranker (backed by search_vector)
  bill-progress.ts              ProgressStage enum + latestActionText → stage classifier
  bill-ingestion.ts             ingest update logic + guardrails (date corruption hazard)
  bill-image-categories.ts      deterministic hash(billId+category) → fallback image URL
  topic-image-pool.ts           static fallback pool keyed by topic category
  image-pool.ts                 BillImageAsset selection: build category keys, deterministic pick from curated DB pool
  image-pool-read.ts            request-path read helpers for the curated pool
  openverse.ts                  Openverse image search client (CC0/PDM-filtered)
  wikimedia-commons.ts          Wikimedia Commons image search client (CC0/PDM-filtered)
  legislative.ts                progress-stage helpers shared by feed + bill page UI
  breaking-bills.ts             "breaking" detection (Bill.breakingAt) for the home feed
  rep-positions.ts              representative stance reads
  account-digests.ts            digest selection + render
  scraper.ts                    rep website scraping
  taxonomy/                     LoC policy-area classification (api/llm/keyword fallbacks)
  jobs/                         coordinators invoked by Lambda jobs
prisma/schema.prisma            schema (no migration files; uses `prisma db push`)
scripts/                        ingest, seeds, backfills, dev helpers
legacy-next-static/             baked-in static assets carried into the Docker image
```

Key data model relationships:

- `Bill` 1—1 `Summary`, 1—N `Stance`, 1—N `Feedback`
- `Bill` N—1 `BillImageAsset` (curated, license-clean image pool keyed by `categoryKey` like `loc-area/Health` or `loc-subject/Medicare`; backed by S3 + CloudFront)
- `Representative` 1—N `RepStance` (unique on `[repId, billId]`)
- `User` (cookie-based, optional email) 1—N `Session`, `BillView`, `EmailDigestLog`
- `ZipDistrict` is the local ZIP→state+district lookup table

Bill IDs use the format `{type}-{number}-{congress}` (e.g. `hr-1234-119`).

`Bill.progressStage` tracks legislative progress as one of: `introduced`, `committee`, `passed_origin`, `passed_both`, `to_president`, `enacted` (see `lib/bill-progress.ts`). Backfill via `npm run backfill:progress`. Postgres FTS over title/sponsor lives in the generated `search_vector` column — install with `npm run setup:search` after `prisma db push`.

## Code conventions

- **Server vs client components**: server components fetch via Prisma directly. Mark only interactive UI with `"use client"`. Never `useEffect`-fetch data that the server can render.
- **Force dynamic**: every page that hits the DB must `export const dynamic = "force-dynamic"`. Static prerender will fail in build environments without DB access.
- **API routes**: return `NextResponse.json()`; validate inputs and return 400 on missing params; never leak raw Prisma errors to the client; protect `/api/ingest` with the `x-ingest-secret` header.
- **DB access**: only via the `lib/prisma.ts` singleton.
- **Cards are core primitives**: `IssueCard`, `StanceCard`, `ActionCard` — extend these instead of replacing them. Cards use `.card`; buttons use `.btn-primary` / `.btn-outline`.
- **Styling**: Tailwind utilities only, no inline styles. Custom design tokens: `navy`, `cream`, `civic-red`, `civic-blue`, `civic-gold`.
- **Nonpartisanship**: AI summarization prompts must explicitly enforce neutral language. Stance cards show vote counts only — no editorial framing. Always show the official bill title alongside the AI summary.
- **Bill summaries** are pre-generated at ingest time and stored in `Summary`. Do not call the LLM at request time. The `whyItMatters` field is a single string with two labeled sections (`WHY THIS MATTERS:` / `WHO THIS AFFECTS:`) split by `lib/bill-summary.ts:splitWhyAndWho`.
- **Images**: real-world only, no AI-generated bill art, no portraits. The current system is a curated pool: `npm run curate:images` populates `BillImageAsset` from Wikimedia Commons + Openverse (CC0/PDM only — strict license filtering at the source) into S3, served via CloudFront. `npm run backfill:bill-images` then assigns one to each `Bill` deterministically (`hash(billId + categoryKey)` over the bill's policy areas + legislative subjects). Runtime read order: `Bill.imageAsset.cdnUrl` → legacy `Bill.imageUrl` → static topic-pool fallback. Don't fetch, generate, or upload images at request time.

## High-risk areas

- **`Bill.introducedAt`** has had data-corruption incidents. Any ingest change must validate dates against Congress.gov and never write placeholder `now()` timestamps. Use `npm run backfill:dates` to repair.
- **Representative stance scraping** is expensive — keep it incremental, cached, and asynchronous. Don't run broad rep analysis on the request path.
- **Heavy work on the request path** (image generation, ingestion triggers, broad DB writes in health checks) is forbidden. Move expensive work into scheduled jobs / Lambdas.

## Environment variables

Minimum required (see `civic-connect/.env.local.example` — but note the example file lists the Claude Haiku model ID, while production code currently defaults to Nova Micro):

```env
DATABASE_URL=
CONGRESS_API_KEY=
GOOGLE_CIVIC_API_KEY=
INGEST_SECRET=
CRON_SECRET=

AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.nova-micro-v1:0   # current code default
# Either bearer or IAM:
AWS_BEARER_TOKEN_BEDROCK=
# or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY

APP_BASE_URL=https://www.civicconnect.net
SES_FROM_EMAIL=
SES_REPLY_TO=
```

Legacy Google Gemini and Anthropic SDK keys still appear in `.env.local.example` and `package.json` dependencies, but `lib/summarize.ts` and `lib/aws-bedrock.ts` route through Bedrock only.

## Validation baseline

Before claiming a production-sensitive change is done:

- `npm run build` passes
- `/api/test` is healthy
- homepage renders
- `/bills` renders
- at least one bill detail page renders
- if account/email touched: signup, preferences persist, welcome path executes, `/api/account/digests` still works

## Stale doc warnings

These docs predate the AWS migration and conflict with current production reality. Defer to `civic-connect/LLM_CONTEXT.md` / `PROJECT_HANDOFF.md` / `civic-connect/README.md` when they disagree:

- Top-level `README.md` — describes Vercel deployment and Google Gemini AI; refers to ProPublica deprecation as recent.
- `.kiro/steering/project-overview.md` and `.kiro/steering/coding-standards.md` — say production is Vercel + Gemini and list `GOOGLE_GEMINI_KEY` as required.
- `civic-connect/AWS_BEDROCK_SETUP.md` — instructs updating "Vercel Environment Variables" and points at Claude Haiku 4.5; current code defaults to Nova Micro.
- `civic-connect/.env.local.example` — sets `AI_PROVIDER=google` and `AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0`. Real provider is Bedrock; default model is Nova Micro.
- Older revisions of `LLM_CONTEXT.md` and `PROJECT_HANDOFF.md` linked to `/Users/kathleenhiggins/...` paths from a different machine. They have been rewritten to relative paths; if any new doc still uses Mac-style absolute paths, treat them as relative under `civic-connect/`.

## Kiro

`.kiro/specs/civic-connect/` holds the original spec; `.kiro/steering/*.md` is auto-injected steering context (now partially stale, see above); `.kiro/hooks/typecheck-on-save.kiro.hook` runs `tsc --noEmit` on save when working in Kiro.
