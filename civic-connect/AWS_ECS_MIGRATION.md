# AWS Migration Plan

This project is moving in two phases:

1. `Phase 1`: move hosting and background jobs to AWS while keeping `Neon` as the database.
2. `Phase 2`: migrate the database from `Neon` to `Aurora PostgreSQL Serverless v2` behind `RDS Proxy`.

This keeps the risky infrastructure changes separate from the database migration.

## Phase 1

### Target architecture

- Website: `Amazon ECS Express Mode`
- Background jobs: `AWS Lambda`
- Scheduling: `Amazon EventBridge Scheduler`
- Queueing: `Amazon SQS`
- Database: `Neon Postgres`
- AI: `Amazon Bedrock`

### Repo-side changes already made

- `scripts/start.sh` now only starts the web server.
- Shared job modules live under `lib/jobs/`.
- `docker-compose.yml` uses `scripts/start-local.sh` for local Docker bootstrapping.
- Vercel build config no longer runs `prisma db push`.

### AWS console steps

1. Create an `ECR` private repository named `civic-connect-web`.
2. Grant the deployment IAM principal permission to push images to ECR.
3. Push the production image to ECR.
4. Create an `ECS Express Mode` service from that image.
5. Configure the ECS service environment variables.
6. Keep outbound networking public for Phase 1 so the service can reach Neon and Bedrock without extra VPC work.
7. Create three Lambda functions:
   - `civic-ingest-job`
   - `civic-scrape-coordinator`
   - `civic-scrape-worker`
8. Create one main SQS queue and one dead-letter queue:
   - `civic-scrape-queue`
   - `civic-scrape-dlq`
9. Attach the SQS trigger to `civic-scrape-worker`.
10. Create EventBridge schedules:
   - ingest cadence -> `civic-ingest-job`
   - scrape cadence -> `civic-scrape-coordinator`
11. Once AWS jobs are stable, remove Vercel cron usage.

### ECS environment variables

At minimum, set:

```bash
DATABASE_URL=...
CONGRESS_API_KEY=...
GOOGLE_CIVIC_API_KEY=...
GOOGLE_GEMINI_KEY=...
ANTHROPIC_API_KEY=...
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
AWS_BEARER_TOKEN_BEDROCK=...
INGEST_SECRET=...
CRON_SECRET=...
```

If you move Bedrock auth to IAM roles later, remove the bearer token.

### Lambda environment variables

Use the same application env vars that each job actually needs.

- `civic-ingest-job`: `DATABASE_URL`, `CONGRESS_API_KEY`, secrets it needs
- `civic-scrape-coordinator`: `DATABASE_URL`, `CRON_SECRET` if needed
- `civic-scrape-worker`: `DATABASE_URL`, `AWS_REGION`, `AWS_BEDROCK_MODEL`, Bedrock auth

### Validation checklist

1. `npm run build` succeeds locally.
2. The ECR image builds successfully.
3. The ECS Express service boots and serves the site.
4. The ECS site can read from Neon.
5. `civic-ingest-job` runs manually in Lambda.
6. `civic-scrape-coordinator` publishes messages to SQS.
7. `civic-scrape-worker` consumes a message and writes results back to Postgres.

## Phase 2

### Target architecture

- Website: `Amazon ECS Express Mode`
- Background jobs: `AWS Lambda`
- Scheduling: `Amazon EventBridge Scheduler`
- Queueing: `Amazon SQS`
- Database: `Aurora PostgreSQL Serverless v2`
- Connection pooling for Lambda: `RDS Proxy`
- Secrets: `AWS Secrets Manager`

### Why Phase 2 is separate

Changing hosting and changing the database at the same time makes rollback harder. Once ECS and Lambda are stable against Neon, move only the database.

### AWS console steps

1. Create an `Aurora PostgreSQL Serverless v2` cluster in the target AWS region.
2. Create the database, app user, and password.
3. Store credentials in `Secrets Manager`.
4. Create an `RDS Proxy` for the Aurora cluster.
5. Put ECS and Lambda in the same VPC/subnets as Aurora and the proxy.
6. Update security groups so ECS and Lambda can reach the proxy, and the proxy can reach Aurora.
7. Export data from Neon.
8. Import the schema and data into Aurora.
9. Point the application `DATABASE_URL` at Aurora for ECS first.
10. Point the Lambda jobs at the `RDS Proxy` endpoint.
11. Run smoke tests for reads, writes, ingestion, and scraping.
12. Decommission the Neon database only after a rollback window passes.

### Data migration workflow

1. Freeze schema changes.
2. Run a final `prisma db push` or migration against the target schema before data import.
3. Export Neon with `pg_dump`.
4. Restore into Aurora with `pg_restore` or `psql`, depending on dump format.
5. Verify row counts for core tables:
   - `Bill`
   - `BillSummary`
   - `Representative`
   - `RepStance`
   - `ScrapedContent`
   - `Organization`
   - `Event`
   - `User`
   - `Session`
   - `PageView`
6. Swap application environment variables.

### Cutover order

1. Cut ECS from Neon to Aurora.
2. Validate web reads and writes.
3. Cut Lambda jobs from Neon to Aurora.
4. Validate scheduled jobs.
5. Keep Neon untouched for rollback until the system is stable.

## Current blockers

- The AWS deployment principal needs `ECR` push permissions before images can be pushed.
- Docker Desktop must be running locally to build and push the image from this machine.

