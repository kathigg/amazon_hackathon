# CivicConnect

[Watch the demo on YouTube](https://www.youtube.com/watch?v=3E_O_ivngXE)

An AI-powered U.S. legislative tracker that turns dense federal bills into plain-language summaries, shows how each party voted, and connects citizens to advocacy organizations and their elected representatives.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Design Decisions](#design-decisions)
3. [How Kiro Was Used](#how-kiro-was-used)
4. [Learning Journey and Forward Thinking](#learning-journey-and-forward-thinking)
5. [Setup and Running](#setup-and-running)
6. [Deployment](#deployment)
7. [Data Sources](#data-sources)
8. [References](#references)

---

## Project Overview

### The Problem

Federal legislation is written in legal language that most Americans cannot easily parse. Research confirms that bills have become less readable over time despite decades of plain-language mandates (Martinez et al., 2024). At the same time, people who want to get involved civically often do not know which organizations are working on the issues they care about, or how to reach their own representatives.

### Who It Is For

- Citizens who want to understand what Congress is doing without a law degree
- First-time voters and young civic participants
- Advocacy organizations looking to reach engaged constituents
- Journalists and researchers tracking legislative activity

### What It Does

CivicConnect presents active federal legislation through three types of information cards, modeled on the card-based UI architecture of [Bijak Memilih](https://bijakmemilih.id) and adapted for the American political system:

- Issue Cards: active bills with AI-generated plain-language summaries, status, sponsor, and topic tags
- Stance Cards: side-by-side Democrat vs Republican vote breakdowns, sourced from recorded votes only
- Action Cards: matched advocacy organizations, upcoming events, and one-click representative contact

### Key Features

- Live bill data from the Congress.gov API (119th Congress)
- Google Gemini 1.5 Flash generates plain-language summaries at an 8th-grade reading level
- Official bill title always shown alongside the AI summary for transparency
- User feedback mechanism to flag potentially biased summaries
- Party vote breakdowns sourced from Congress.gov recorded votes
- Advocacy organization directory with event listings and RSVP
- Representative lookup by ZIP code via Google Civic Information API
- Search and filter bills by topic area across 12 categories
- Fully responsive, mobile-first design
- Daily automated bill ingestion via Vercel cron

---

## Design Decisions

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 App Router | Consolidates frontend and backend into one deployable unit. Server components fetch from Postgres with no client-side waterfalls. |
| Database | PostgreSQL via Prisma | Relational structure fits the bill/summary/stance relationships well. Prisma gives type-safe queries and easy migrations. |
| AI | Google Gemini 1.5 Flash | Free tier (15 RPM, 1M tokens/day) is sufficient for batch ingestion of 250 bills. Structured JSON output mode removes the need for fragile prompt parsing. |
| Styling | Tailwind CSS | Utility-first keeps styles co-located with components and avoids stylesheet sprawl. |
| Deployment | Docker Compose (local) + Vercel (production) | Docker gives a reproducible local environment. Vercel handles cron, edge functions, and zero-config deploys. |

### Architecture

```
Browser
  └── Next.js 14 App Router (server + client components)
        ├── /bills, /bill/[id]     -- Issue + Stance + Action cards
        ├── /orgs, /orgs/register  -- Advocacy org directory
        ├── /bill/[id]/contact     -- Rep contact by ZIP
        └── /api/*                 -- API routes (bills, orgs, reps, ingest)
              ├── Congress.gov API     -- bill metadata, text, votes
              ├── Google Gemini API    -- AI summarization
              └── Google Civic API    -- representative lookup
        └── Prisma ORM → PostgreSQL
```

### Trade-offs

**Server components by default.** All data fetching happens on the server. This means faster page loads and no exposed API keys, but it also means any interactive UI (buttons, forms) needs to be split into a separate client component. The rule in this project is: server components fetch data, client components handle interactivity.

**Pre-generated summaries.** AI summaries are generated at ingest time and stored in the database. This means no LLM calls happen at page load, keeping the app fast and predictable. The trade-off is that summaries are not regenerated unless you re-run ingestion.

**Congress.gov only (no ProPublica).** ProPublica's Congress API was deprecated in 2024. All bill data and vote records now come from the official Congress.gov API, which provides the same vote data via its actions endpoint.

**No user accounts.** RSVP uses email only. This keeps the MVP simple and avoids storing sensitive user data, but it also means there is no way to send follow-up notifications or let users track bills they care about. That is a planned future feature.

### Security

- The Google Civic API key is IP-restricted and only called server-side. It is never sent to the browser.
- The `/api/ingest` route requires an `x-ingest-secret` header to prevent unauthorized triggering.
- No user PII is collected beyond an email address for event RSVPs.
- Raw Prisma errors are never exposed to the client. API routes return generic error messages.

### Scalability

- `force-dynamic` on all data pages ensures content is always fresh, at the cost of no static caching. For a civic information tool, accuracy matters more than cache performance.
- Prisma indexes on `topicTags`, `status`, and `introducedAt` keep filtering fast as the bill count grows.
- Bill summaries are pre-generated and cached in the database, so AI costs do not scale with traffic.
- Vercel cron runs ingestion daily at 6am UTC, keeping the dataset current without manual intervention.

### Nonpartisanship by Design

This was a deliberate constraint throughout the build:

- AI prompts explicitly instruct neutral language and prohibit editorializing
- Official bill titles are always shown alongside AI summaries
- Stance cards display vote counts only, with no framing or commentary
- Users can flag summaries they believe are biased; flag counts are stored for review

---

## How Kiro Was Used

This project was built using [Kiro](https://kiro.dev) with spec-driven development, steering documents, agent hooks, and Autopilot mode throughout.

### Spec-Driven Development

Before writing any code, the full feature spec was written in `.kiro/specs/civic-connect/`:

- `requirements.md` covers functional and non-functional requirements
- `design.md` covers architecture, data models, API routes, and the UI system

Having these documents in place before coding meant Kiro could reference them throughout the build to make consistent decisions about schema design, API structure, and component architecture. It also meant there was no architectural backtracking mid-build.

### Steering Documents

`.kiro/steering/` contains always-on context that is injected into every agent interaction automatically:

- `project-overview.md` describes the stack, conventions, environment variables, and how to run the project
- `coding-standards.md` defines component rules, API rules, nonpartisanship rules, and styling rules

These documents acted as a persistent memory layer. Instead of repeating "use Tailwind only" or "server components fetch data directly" in every prompt, those rules were always present. This eliminated an entire class of inconsistency across generated code.

### Agent Hooks

`.kiro/hooks/typecheck-on-save.json` runs `tsc --noEmit` automatically whenever a `.ts` or `.tsx` file is saved. This caught type errors immediately rather than at build time, which kept the feedback loop tight during development.

### Vibe Coding with Autopilot

The entire application was built through natural language conversation with Kiro in Autopilot mode. This includes the Prisma schema, 8 API routes, 8 React components, 5 pages, ingestion scripts, Docker setup, and all configuration. The workflow was: describe what you want, review what Kiro produces, refine with follow-up prompts. Spec and steering documents provided the guardrails that kept the output consistent across sessions.

---

## Learning Journey and Forward Thinking

### Challenges

**ProPublica deprecation.** The original design spec referenced ProPublica's Congress API for vote data. Mid-build, it became clear that ProPublica shut down their API in 2024. The pivot to Congress.gov's own vote endpoints was straightforward once the right endpoint was identified, but it required updating both the ingestion script and the design doc.

**Next.js config format.** Next.js 14.2 does not support `next.config.ts`. The config file needs to be `.mjs`. This is a small thing but it caused a confusing build error early on.

**Static prerendering with a database.** Next.js tries to statically prerender pages at build time. Any page that calls Prisma at build time will fail if there is no database available during the build. The fix is `export const dynamic = "force-dynamic"` on every data page, which opts them out of static generation entirely.

**Structured AI output.** Getting Gemini to return consistent JSON required using `responseMimeType: "application/json"` in the API call rather than relying on prompt instructions alone. Once that was in place, the output was reliable.

### Lessons

Spec-first development pays off. Having requirements and design documents written before any code was generated meant the architecture was decided upfront. There was no moment of "wait, this does not fit the data model" halfway through.

Steering documents are underrated. Injecting project conventions automatically into every agent interaction removed a whole category of bugs that come from inconsistent patterns across files. It is worth spending time on these before starting a build.

Constraints produce better output. The nonpartisanship rules, the card-based UI system, and the "server components fetch data" rule all acted as creative constraints that made the codebase more coherent. Kiro worked better with clear rules than with open-ended prompts.

### Future Plans

- Richer stance cards with party platform excerpts and official press statements
- State-level legislation via NCSL API integration
- Email and SMS alerts when bills you follow advance in Congress
- Multilingual summaries (Spanish, Mandarin, Vietnamese) to reach non-English-speaking citizens
- Bias audit dashboard: an admin view of flagged summaries with a review and correction workflow
- User accounts with saved bills and personalized topic feeds

---

## Setup and Running

### Prerequisites

- Docker Desktop
- API keys (see Environment Variables below)

### Quick Start with Docker

```bash
git clone <your-repo-url>
cd civic-connect
cp .env.local.example .env.local   # fill in your API keys
docker compose up --build
```

App runs at `http://localhost:3000`. On first boot, Docker will automatically:
1. Start PostgreSQL
2. Run `prisma db push` to create tables
3. Run `npm run ingest` to fetch 250 bills and generate AI summaries
4. Start the Next.js app

### Without Docker

```bash
npm install
npx prisma db push
npm run ingest
npm run seed:orgs   # loads the advocacy organization directory
npm run dev
```

### Environment Variables

```env
CONGRESS_API_KEY=        # free at api.congress.gov
GOOGLE_GEMINI_KEY=       # free at aistudio.google.com
GOOGLE_CIVIC_API_KEY=    # console.cloud.google.com -- use IP restriction
DATABASE_URL=            # postgresql://user:pass@host:5432/civicconnect
INGEST_SECRET=           # any random string
```

### Manual Bill Ingestion

```bash
# Via script (local)
npm run ingest

# Via API (production)
curl -X POST https://your-domain.com/api/ingest \
  -H "x-ingest-secret: your_secret"
```

---

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo in Vercel
3. Add all environment variables in the Vercel dashboard
4. Add a Postgres database (Vercel Postgres or Neon)
5. Deploy -- `vercel.json` configures the daily cron automatically

---

## Data Sources

- [Congress.gov API](https://api.congress.gov) -- U.S. Library of Congress, bill metadata and vote records
- [Google Civic Information API](https://developers.google.com/civic-information) -- representative lookup by address
- [Google Gemini API](https://aistudio.google.com) -- AI summarization

---

## References

- Kornilova & Eidelman (2019). BillSum: A Corpus for Automatic Summarization of US Legislation. EMNLP 2019.
- Martinez, Mollica & Gibson (2024). So Much for Plain Language. PNAS.
- Legal Lay Summarization (2025). Artificial Intelligence Review.
