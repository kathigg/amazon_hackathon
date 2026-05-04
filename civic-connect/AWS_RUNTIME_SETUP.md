# AWS Runtime Setup

This repository now uses AWS as the production platform for:

- web hosting
- background jobs
- database traffic
- production email delivery
- production AI inference

Do not reintroduce Neon as the production database path.

## Production architecture

- Web app: `Amazon ECS Express Mode`
- Database: `Amazon Aurora PostgreSQL Serverless v2`
- Connection pooling for jobs: `Amazon RDS Proxy`
- Secrets: `AWS Secrets Manager`
- Scheduled jobs: `Amazon EventBridge Scheduler`
- Queueing: `Amazon SQS`
- Job execution: `AWS Lambda`
- AI in production: `Amazon Bedrock`
- Transactional email: `Amazon SES`

## Non-negotiable rule

For production changes, assume `DATABASE_URL` must point at AWS-hosted Postgres.

- Do not wire production or ECS back to Neon.
- Do not assume old Vercel cron jobs still exist.
- Do not assume background jobs run inside the web process.
- Do not store production secrets only in local `.env.local`.

If you need a local database for development, that is fine. That does not change the production requirement.

## AWS resources currently expected

- ECS service: `civic-connect-web`
- Aurora cluster: `civic-connect-aurora`
- RDS Proxy: `civic-connect-rds-proxy`
- ECR repositories:
  - `civic-connect-web`
  - `civic-connect-jobs`
- Lambda functions:
  - `civic-ingest-job`
  - `civic-scrape-coordinator`
  - `civic-scrape-worker`
  - `civic-account-digests-job`
- SQS queues:
  - `civic-scrape-queue`
  - `civic-scrape-dlq`

## Authentication

Use AWS CLI browser login:

```bash
aws login --region us-east-1
aws sts get-caller-identity
```

If the session expires, run `aws login` again before attempting ECS, RDS, ECR, Lambda, or Scheduler commands.

## Required production secrets

At minimum, production services expect:

```bash
DATABASE_URL
CONGRESS_API_KEY
GOOGLE_CIVIC_API_KEY
AWS_BEARER_TOKEN_BEDROCK
AWS_REGION
AWS_BEDROCK_MODEL
INGEST_SECRET
CRON_SECRET
APP_BASE_URL
SES_FROM_EMAIL
SES_REPLY_TO
```

Store these in AWS Secrets Manager or the ECS/Lambda secret wiring, not just in local files.

## Database rules

### ECS

- The ECS web service should use the AWS-hosted `DATABASE_URL`.
- Validate with:

```bash
curl -sS https://www.civicconnect.net/api/health
```

Expected result:
- HTTP `200`
- JSON containing `status: ok`
- JSON containing `database: connected`

### Lambda

- Lambda jobs should use the Aurora/RDS Proxy path.
- The worker and coordinator should not depend on Neon.
- If representative-analysis jobs are failing, check:
  - Lambda VPC config
  - RDS Proxy health
  - queue depth
  - Bedrock credentials

## Deployment flow

Use this order for web deployments:

1. `aws login --region us-east-1`
2. Build the app locally:

```bash
npm run build
```

3. Log Docker into ECR:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 712589718735.dkr.ecr.us-east-1.amazonaws.com
```

4. Build the image:

```bash
docker build -t civic-connect-web:<tag> .
```

5. Tag for ECR:

```bash
docker tag civic-connect-web:<tag> 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag>
```

6. Push to ECR:

```bash
docker push 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag>
```

7. Update ECS Express to the new image.
8. Wait for deployment completion.
9. Re-test:
   - `/api/health`
   - `/api/bills?limit=1`
   - `/api/orgs?q=climate`
   - `/api/reps?zip=10001`

## Validation checklist after any production change

Run or verify all of these:

1. `npm run build`
2. `https://www.civicconnect.net/api/health`
3. `https://www.civicconnect.net/`
4. `https://www.civicconnect.net/bills`
5. `https://www.civicconnect.net/api/bills?limit=1`
6. `https://www.civicconnect.net/api/orgs?q=climate`
7. `https://www.civicconnect.net/api/reps?zip=10001`

For account-related changes, also validate:

1. account creation
2. welcome email send
3. subscription preference persistence
4. ZIP-based representative selection
5. personalized bill experience after signup

## Email automation

- Welcome emails are sent directly by the web app after account creation.
- Daily and weekly digests are dispatched by `civic-account-digests-job`.
- The AWS schedule `civic-account-digests-hourly` runs every hour.
- The application decides whether a user is actually due based on:
  - stored timezone
  - local 9am check
  - daily vs weekly subscription settings
  - dedupe rows in `EmailDigestLog`

Keep the scheduler frequent and keep the actual eligibility logic in app code.

## If something looks like the old system

That is a bug.

Examples:

- references to Neon in production instructions
- references to Vercel cron as the active scheduler
- production database changes attempted only through local `.env.local`
- rep lookup returning all members of a state instead of the user’s actual delegation

Treat those as migration regressions and correct them.
