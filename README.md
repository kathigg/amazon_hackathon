# CivicConnect

**Live project:** [https://www.civicconnect.net](https://www.civicconnect.net)

CivicConnect is a free legislative tracking and grassroots advocacy platform that translates active U.S. federal legislation into plain-language, card-based summaries. It is built for people who want to understand what Congress is doing without needing to read dense statutory text, pay for lobbyist-oriented tools, or know where to look across disconnected government websites.

The application combines official bill metadata, AI-generated summaries, representative stance tracking, advocacy organization matching, ZIP-based representative lookup, saved user preferences, and scheduled email briefings.

## What The Project Does

CivicConnect helps users:

- Browse recent and high-salience federal bills in a card-based feed.
- Open a bill page with the official title, sponsor, dates, legislative status, and progress tracker.
- Read a plain-language AI summary, key provisions, “why this matters,” and “who this affects.”
- Compare representative and party positions through the Auto-Whip interface.
- Find advocacy organizations connected to the topics in a bill.
- Select their senators and House representative by ZIP code.
- Create an account, save issue preferences, and choose daily, weekly, or no email updates.
- Receive bill digest emails through Amazon SES once email delivery is enabled.

The design is informed by civic-education systems such as Bijak Memilih and by research on plain-language legal communication, trust in AI summaries, political efficacy, and civic engagement.

## Repository Layout

The production app lives in [`civic-connect`](./civic-connect).

Important files and directories:

- [`civic-connect/app`](./civic-connect/app) — Next.js App Router pages and API routes.
- [`civic-connect/components`](./civic-connect/components) — React UI components for bill cards, account flows, Auto-Whip, and page sections.
- [`civic-connect/lib`](./civic-connect/lib) — data access, bill ingestion helpers, AI providers, email generation, representative logic, caching, and utility code.
- [`civic-connect/prisma`](./civic-connect/prisma) — Prisma schema for PostgreSQL.
- [`civic-connect/scripts`](./civic-connect/scripts) — ingestion, backfill, setup, Bedrock, image, and email scripts.
- [`civic-connect/AWS_ONBOARDING.md`](./civic-connect/AWS_ONBOARDING.md) — AWS maintainer runbook.
- [`civic-connect/AWS_RUNTIME_SETUP.md`](./civic-connect/AWS_RUNTIME_SETUP.md) — production runtime and deployment details.
- [`civic-connect/AWS_BEDROCK_SETUP.md`](./civic-connect/AWS_BEDROCK_SETUP.md) — Bedrock configuration notes.
- [`civic-connect/AWS_CLOUDFRONT_GEOLOCATION.md`](./civic-connect/AWS_CLOUDFRONT_GEOLOCATION.md) — CloudFront location-header setup.

## Technical Architecture

### Application Layer

- **Framework:** Next.js 14 App Router.
- **Language:** TypeScript.
- **UI:** React components with Tailwind CSS.
- **API surface:** Next.js route handlers under `/api/*`.
- **ORM:** Prisma.
- **Runtime build:** Next.js standalone Docker image.

The app uses server-rendered routes for bill pages, account pages, organization pages, and API endpoints. Expensive AI work is designed to happen during ingestion and background jobs, not on the primary user request path.

### AWS Production Architecture

Production is hosted on AWS, not GitHub Pages.

GitHub is used for source control only. The public website is served from AWS infrastructure at [https://www.civicconnect.net](https://www.civicconnect.net).

Current AWS framework:

- **Amazon CloudFront** fronts the public site, terminates TLS, serves static assets, and can pass viewer geolocation headers into the app.
- **Amazon ECS on Fargate** runs the `civic-connect-web` service as a containerized Next.js app.
- **Amazon ECR** stores Docker images for the web service and background job images.
- **Aurora PostgreSQL / RDS-compatible PostgreSQL** stores bill data, user preferences, summaries, representative stances, organizations, email logs, and image assignments.
- **RDS Proxy** is used as the application database connection target in production.
- **AWS Secrets Manager** stores sensitive runtime values such as `DATABASE_URL`, API keys, ingest secrets, and cron secrets.
- **Amazon Bedrock** runs the LLM summarization and enrichment layer through Amazon Nova models.
- **Amazon SES** sends transactional and digest email from the CivicConnect domain, currently configured to use `summary@civicconnect.net`.
- **Amazon S3** stores curated topic-based image assets for bill imagery.
- **CloudWatch Logs and alarms** provide runtime logging and deployment rollback signals.
- **EventBridge Scheduler and lightweight AWS job dispatchers** are used for scheduled ingestion, digest dispatch, and representative-position refresh work.

### Request Flow

```text
User browser
  -> CloudFront
  -> ECS Fargate service: civic-connect-web
  -> Next.js App Router page or API route
  -> Prisma
  -> RDS Proxy
  -> Aurora/PostgreSQL
```

Static assets are served through CloudFront. Dynamic bill, account, representative, and digest behavior runs in the ECS-hosted Next.js application.

### Data Pipeline

```text
Scheduled job
  -> Congress.gov API
  -> bill/action/vote normalization
  -> PostgreSQL via Prisma
  -> Bedrock/Nova summarization and classification
  -> topic/image/organization matching
  -> rendered bill cards, bill pages, account feeds, and email digests
```

Core data sources:

- **Congress.gov API** — official bill metadata, sponsors, actions, text links, and legislative status.
- **Google Civic Information API** — ZIP/address-based representative lookup.
- **Local ZIP-to-district data** — fallback and enrichment for representative selection.
- **Curated organization directory** — advocacy organizations matched by issue area.
- **Curated S3 image pool** — issue-category images assigned to bills by topic.

### AI Layer

CivicConnect uses Amazon Bedrock for model calls. The production summarization path is designed around low-cost Amazon Nova models so the platform can stay free to users.

The AI pipeline generates structured bill content such as:

- three-paragraph plain-language summaries;
- key provisions;
- “why this matters”;
- “who this affects”;
- topic and taxonomy enrichment;
- representative stance summaries when supporting evidence is available.

Official bill metadata remains the source of truth for titles, sponsors, dates, actions, and status. AI summaries are stored in the database and displayed with official context so users can verify against the original source.

### Email Layer

Email is handled through Amazon SES.

Supported flows:

- Welcome email after account creation.
- “Bills you might be interested in” onboarding digest.
- Daily digest at the user’s local 9am if selected.
- Weekly digest at the user’s local 9am if selected.
- No recurring email if the user selects “never.”

Email delivery is guarded by environment configuration. The code can generate previews and dry runs without sending real email. Production sends should only occur when the SES sender/domain and recipient rules are valid.

### Account And Personalization Layer

Users can create lightweight accounts and save:

- email address;
- issue interests;
- email frequency preference;
- timezone;
- ZIP code;
- selected senators and House representative.

The homepage and bill pages use this saved information to make the bill desk and Auto-Whip views more relevant.

## Deployment Model

Production deployment is AWS-based:

1. Build the Next.js standalone Docker image from `civic-connect`.
2. Push the image to Amazon ECR.
3. Register a new ECS task definition revision.
4. Update the `civic-connect-web` ECS service.
5. Let ECS perform a rolling/canary deployment with healthy old tasks remaining online.
6. Verify `/`, `/bills`, `/api/test`, one bill page, and any changed route.
7. Invalidate CloudFront paths when cached HTML or static routing behavior changed.

The project is **not** hosted on GitHub Pages. There should be no GitHub Pages production deployment for this repository. GitHub should remain the code repository; AWS is the production runtime.

## Local Development

From the app directory:

```bash
cd civic-connect
npm install
```

Create `.env.local` with the required local or shared development values:

```env
DATABASE_URL=
CONGRESS_API_KEY=
GOOGLE_CIVIC_API_KEY=

AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=amazon.nova-micro-v1:0
SES_FROM_EMAIL=summary@civicconnect.net
SES_REPLY_TO=summary@civicconnect.net

APP_BASE_URL=https://www.civicconnect.net
CRON_SECRET=
INGEST_SECRET=
```

Sync the database schema and seed supporting data:

```bash
npx prisma db push
npm run seed:orgs
npm run seed:reps
```

Run the app locally:

```bash
npm run dev
```

Build before deployment:

```bash
npm run build
```

Useful scripts:

```bash
npm run ingest
npm run backfill:dates
npm run backfill:taxonomy
npm run enrich:tags
npm run setup:search
```

## Operational Notes

- Production database access should use Aurora/RDS Proxy, not Neon.
- Production AI should use Bedrock, not direct consumer AI APIs.
- Production email should use SES from the CivicConnect domain.
- Request-time AI generation should be avoided on user-facing paths; generate summaries and images in background jobs.
- Bill dates and statuses should come from Congress.gov metadata, not AI output.
- Bill images should come from the S3-backed topic image pool when available.
- Secrets should live in AWS Secrets Manager, not in README files, commits, or chat.
- ECS deployments should preserve desired capacity and avoid downtime.

## Product And Research Context

CivicConnect is also part of an HCI/civic-technology research project studying whether AI-summarized, card-based legislative information improves perceived comprehension, trust calibration, and civic engagement.

The study design uses a three-wave longitudinal evaluation with validated instruments including SUS, Human-Generative AI Trust measures, AI literacy items, internal political efficacy, and political engagement measures. The product surface under evaluation is the issue-card and bill-page experience: official bill context plus AI-generated plain-language explanation.

## References

- U.S. Library of Congress, [Congress.gov API](https://api.congress.gov)
- Google, [Civic Information API](https://developers.google.com/civic-information)
- Bijak Memilih, [Vote Wisely](https://bijakmemilih.id)
- Kornilova and Eidelman, BillSum: A Corpus for Automatic Summarization of US Legislation
- Martinez, Mollica, and Gibson, So Much for Plain Language
