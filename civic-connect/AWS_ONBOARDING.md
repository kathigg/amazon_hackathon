# AWS Onboarding

This guide is for a new teammate who needs to work on CivicConnect and interact with AWS safely. It is written as a day-one runbook.

Use this document if you need to:

- get access to the AWS account
- verify that access is correct
- understand which AWS services matter
- run the minimum operational checks
- deploy or debug the application

This guide assumes the repository is already checked out locally at:

`/Users/kathleenhiggins/amazon_hackathon/civic-connect`

## Security rule

Do not use or share the AWS root account.

Every collaborator should use either:

- AWS IAM Identity Center / SSO, or
- a scoped IAM user or role

The root account should not be the daily operator path for this project.

## What access a collaborator should get

### GitHub

Recommended minimum:

- `Write` access to the repository if they only need to code and push branches

Recommended for active maintainers:

- `Maintain` if they also need to manage branch workflows and releases

Only use `Admin` if they must manage repo settings, secrets, or protections.

### AWS

Recommended practical access for a production maintainer:

- ECS read/update
- ECR push/pull
- CloudWatch Logs read
- CloudFront read/update
- Lambda read/update/invoke
- EventBridge Scheduler read/update
- Secrets Manager read
- RDS / RDS Proxy read
- SES read / identity config visibility
- SQS read/update if they maintain scraping jobs

If you want least privilege, create one role for application operators and one narrower role for developers.

## AWS services that matter in this project

These are the services a new maintainer should expect to touch:

- `ECS`
  - production web runtime
- `ECR`
  - container image registry
- `CloudFront`
  - viewer headers and front-door routing
- `RDS` / `Aurora` / `RDS Proxy`
  - database and connection path
- `Lambda`
  - ingestion, scraping, and digest jobs
- `EventBridge Scheduler`
  - recurring job triggers
- `CloudWatch Logs`
  - debugging and deployment verification
- `Secrets Manager`
  - production secrets
- `SES`
  - welcome and digest email delivery
- `SQS`
  - scraping queue infrastructure
- `Bedrock`
  - production LLM inference

## Named AWS resources used by CivicConnect

These names are used repeatedly in docs and commands:

### Compute

- ECS service: `civic-connect-web`
- Lambda: `civic-ingest-job`
- Lambda: `civic-account-digests-job`
- Lambda: `civic-scrape-coordinator`
- Lambda: `civic-scrape-worker`

### Container registry

- ECR repo: `civic-connect-web`
- ECR repo: `civic-connect-jobs`

### Database path

- RDS Proxy: `civic-connect-rds-proxy`

### Messaging

- SQS queue: `civic-scrape-queue`
- SQS DLQ: `civic-scrape-dlq`

## First login workflow

### 1. Install and configure AWS CLI

Check:

```bash
aws --version
```

### 2. Authenticate

Use browser login:

```bash
aws login --region us-east-1
```

Then verify identity:

```bash
aws sts get-caller-identity
```

If this fails, stop there. Do not try to work around missing auth by using old local credentials.

### 3. Confirm account and region

This project expects `us-east-1` unless explicitly documented otherwise.

Check:

```bash
aws configure list
```

### 4. Confirm basic service visibility

These should all work for a properly onboarded maintainer:

```bash
aws ecs list-service-deployments --service arn:aws:ecs:us-east-1:712589718735:service/default/civic-connect-web
aws logs describe-log-streams --log-group-name /aws/ecs/default/civic-connect-web-20ee
aws ecr describe-repositories
aws scheduler list-schedules --max-results 20
```

## First-day local setup

### 1. Install dependencies

```bash
cd /Users/kathleenhiggins/amazon_hackathon/civic-connect
npm install
```

### 2. Create local environment

Start from:

- [.env.local.example](/Users/kathleenhiggins/amazon_hackathon/civic-connect/.env.local.example)

### 3. Verify app build

```bash
npm run build
```

### 4. Verify local database path if needed

```bash
npm run test:db
```

### 5. Verify keys and integrations

```bash
npm run test:keys
```

## Secrets a maintainer should know exist

These are the important production secret categories. The actual values should live in AWS, not in docs.

- `DATABASE_URL`
- `CONGRESS_API_KEY`
- `GOOGLE_CIVIC_API_KEY`
- `AWS_BEARER_TOKEN_BEDROCK`
- `AWS_REGION`
- `AWS_BEDROCK_MODEL`
- `INGEST_SECRET`
- `CRON_SECRET`
- `APP_BASE_URL`
- `SES_FROM_EMAIL`
- `SES_REPLY_TO`

If a collaborator cannot read the relevant secret metadata or confirm the wiring, they are not fully onboarded for production support.

## Minimum production health checks

Once onboarded, a collaborator should be able to verify:

```bash
curl -sS https://www.civicconnect.net/api/test
curl -sS https://www.civicconnect.net/
curl -sS https://www.civicconnect.net/bills
curl -sS https://www.civicconnect.net/api/bills?limit=1
curl -sS https://www.civicconnect.net/api/reps?zip=10001
```

The goals:

- the app responds
- the DB path is alive
- the bill feed responds
- rep lookup responds

## Deployment workflow a teammate should understand

### 1. Authenticate AWS

```bash
aws login --region us-east-1
```

### 2. Build the app

```bash
npm run build
```

### 3. Log into ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 712589718735.dkr.ecr.us-east-1.amazonaws.com
```

### 4. Build and push image

```bash
docker build --platform linux/amd64 -t 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag> .
docker push 712589718735.dkr.ecr.us-east-1.amazonaws.com/civic-connect-web:<tag>
```

### 5. Update ECS

The live service is `civic-connect-web`. A maintainer should know how to update the primary container image and watch the rollout.

### 6. Re-validate production

After deployment, always check:

- `/api/test`
- homepage
- `/bills`
- one bill page
- any route touched by the change

## What to check in AWS Console

### ECS

Check:

- service deployments
- active revision
- CPU spikes
- task restarts
- health status

### CloudWatch Logs

Check:

- app boot errors
- Prisma connection failures
- Bedrock failures
- SES send failures
- request-time exceptions

### Lambda

Check:

- last invocation
- error count
- runtime logs
- timeout behavior

### Scheduler

Check:

- schedules are enabled
- target functions are correct
- cadence matches intended product behavior

### RDS / Proxy

Check:

- proxy health
- connection saturation
- DB availability

### SES

Check:

- sender identity is configured
- task runtime has permissions
- deliverability setup exists if needed

## Common onboarding mistakes

Do not:

- use the AWS root account
- assume Vercel is still production
- assume Neon is still production
- assume local `.env.local` is enough to fix ECS/Lambda runtime issues
- deploy code without checking `/api/test`
- edit schedules without understanding which route or Lambda they trigger

## What a fully onboarded maintainer should be able to do

By the end of onboarding, a collaborator should be able to:

1. log into AWS
2. identify the live ECS service
3. locate CloudWatch logs for the web service
4. identify the active deployment revision
5. inspect Lambda jobs and schedules
6. understand where secrets live
7. build and push a container image
8. revalidate the production site after a deploy

## Read next

After this document, the most useful next reads are:

1. [PROJECT_HANDOFF.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/PROJECT_HANDOFF.md)
2. [AWS_RUNTIME_SETUP.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/AWS_RUNTIME_SETUP.md)
3. [AWS_CLOUDFRONT_GEOLOCATION.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/AWS_CLOUDFRONT_GEOLOCATION.md)
4. [LLM_CONTEXT.md](/Users/kathleenhiggins/amazon_hackathon/civic-connect/LLM_CONTEXT.md)

