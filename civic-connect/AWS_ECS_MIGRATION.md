# AWS Deployment Notes

This project now targets AWS as the production platform for both hosting and database traffic.

## Current production architecture

- Website: `Amazon ECS Express Mode`
- Background jobs: `AWS Lambda`
- Scheduling: `Amazon EventBridge Scheduler`
- Queueing: `Amazon SQS`
- Database: `Amazon Aurora PostgreSQL Serverless v2`
- Lambda connection pooling: `Amazon RDS Proxy`
- Secrets: `AWS Secrets Manager`
- AI provider in production: `Amazon Bedrock`

## Repo-side changes already made

- `scripts/start.sh` only starts the web server.
- Shared job modules live under `lib/jobs/`.
- Account onboarding, digest routes, and representative preferences are handled in-app.
- Local docs and copy no longer assume Vercel cron or a Neon-hosted production database.

## Production services

- `civic-connect-web` serves the Next.js app on ECS.
- `civic-ingest-job` runs bill metadata ingestion in Lambda.
- `civic-scrape-coordinator` queues representative-analysis work.
- `civic-scrape-worker` processes the queue and writes results back to Postgres.
- `civic-scrape-queue` and `civic-scrape-dlq` back the representative-analysis pipeline.

## Required environment variables

At minimum, production services should have:

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
APP_BASE_URL=https://www.civicconnect.net
SES_FROM_EMAIL=...
```

If Bedrock auth is moved fully to IAM roles later, remove the bearer token.

## Validation checklist

1. `npm run build` succeeds locally.
2. The ECR image builds successfully.
3. The ECS service serves the site and health checks pass.
4. The ECS service can read and write through Aurora.
5. `civic-ingest-job` runs manually in Lambda.
6. `civic-scrape-coordinator` publishes messages to SQS.
7. `civic-scrape-worker` consumes a message and writes results back to Aurora through RDS Proxy.
8. EventBridge schedules remain enabled for ingest and representative-analysis jobs.

## Rollback posture

- Keep the pre-Aurora dump and the old database path available until the AWS-hosted stack has been stable for the full rollback window.
- Do not decommission the prior database backup until ECS, Lambda, and email digests have all been validated end to end.
