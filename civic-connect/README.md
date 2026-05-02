# CivicConnect

> AI-powered U.S. legislative tracker — plain-language bill summaries, party stance comparisons, and civic action tools.

[Watch the demo on YouTube](https://www.youtube.com/watch?v=3E_O_ivngXE)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Design Decisions](#design-decisions)
3. [How Kiro Was Used](#how-kiro-was-used)
4. [Learning Journey & Forward Thinking](#learning-journey--forward-thinking)
5. [Setup & Running](#setup--running)
6. [Deployment](#deployment-vercel)
7. [Data Sources](#data-sources)
8. [References](#references)

---

## Project Overview

### The Problem

U.S. federal laws are written in dense legal language that most Americans can't easily understand. Research confirms that federal legislation has become *less* accessible over time despite decades of plain-language mandates (Martinez et al., 2024). At the same time, grassroots civic movements struggle with decentralized coordination — people want to act but don't know how to connect with organizations or representatives working on the issues they care about.

CivicConnect solves this by translating active federal legislation into plain English, showing how each party has voted, and connecting citizens directly to advocacy organizations and their elected representatives.

### Who It's For

- Citizens who want to understand what Congress is doing without a law degree
- First-time voters and young civic participants
- Advocacy organizations looking to reach engaged constituents
- Journalists and researchers tracking legislative activity

### What It Does

CivicConnect is a web-first platform modeled on [Bijak Memilih](https://bijakmemilih.id)'s card-based information architecture, adapted for the American political system. It presents information through three card types:

- **Issue Cards** — active bills with AI-generated plain-language summaries, status, sponsor, and topic tags
- **Stance Cards** — side-by-side Democrat vs Republican vote breakdowns, sourced from recorded votes only
- **Action Cards** — matched advocacy organizations, upcoming events, and one-click representative contact

### Key Features

- Live bill data from the Congress.gov API (119th Congress)
- AI-generated plain-language summaries via Vercel AI SDK (Ollama/Gemini/Claude/GPT — configurable per environment)
- Official bill title always shown alongside AI summary for transparency
- User feedback mechanism to flag potentially biased summaries
- Party vote breakdowns sourced from Congress.gov recorded votes
- Advocacy organization directory with event listings and RSVP
- Representative lookup by ZIP code via Google Civic Information API
- Search and filter bills by topic area (12 categories)
- Fully responsive — mobile-first design
- Daily automated bill ingestion via Vercel cron

---

## Design Decisions

### Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | Consolidates frontend and backend into one deployable unit. Server components fetch from Postgres with zero client-side waterfalls. |
| Database | PostgreSQL via Prisma | Relational structure fits the bill/summary/stance relationships well. Prisma gives type-safe queries and easy migrations. |
| AI | Vercel AI SDK (multi-provider) | Unified `generateObject()` API with structured output via zod schema. Supports Ollama (local GPU), Google Gemini, Anthropic Claude, and OpenAI — swap providers via env var, no code changes. Prompt design informed by BillSum research (Kornilova & Eidelman, 2019). |
| Styling | Tailwind CSS | Utility-first keeps styles co-located with components and avoids stylesheet sprawl. |
| Deployment | Docker Compose (local) + Vercel (production) | Docker gives a reproducible local environment. Vercel handles cron, edge functions, and zero-config deploys. |

### Architecture

```
Browser
  └── Next.js 14 App Router (server + client components)
        ├── /bills, /bill/[id]     — Issue + Stance + Action cards
        ├── /orgs, /orgs/register  — Advocacy org directory
        ├── /bill/[id]/contact     — Rep contact by ZIP
        └── /api/*                 — API routes (bills, orgs, reps, ingest)
              ├── Congress.gov API        — bill metadata, text, votes
              ├── Vercel AI SDK           — summarization (Ollama / Gemini / Claude / GPT)
              │     └── lib/bill-text.ts  — HTML→clean text preprocessing
              └── Google Civic API        — representative lookup
        └── Prisma ORM → PostgreSQL
```

### Trade-offs

**Server components by default** — all data fetching happens on the server. Faster page loads, no exposed API keys, but any interactive UI (buttons, forms) needs to be a separate client component. The rule here is simple: server components fetch data, client components handle interactivity.

**Pre-generated summaries** — AI summaries are generated at ingest time and stored in the database, with on-demand generation when a user visits a bill without a summary. Bill text is preprocessed (HTML stripped, whitespace normalized, smart-truncated at section boundaries) before being sent to the LLM. The prompt is informed by the BillSum corpus research — focusing on action verbs, interpreting amendment effects rather than quoting legal mechanics, and covering the entire bill rather than just the beginning.

**Congress.gov only (no ProPublica)** — ProPublica's Congress API was deprecated in 2024. All bill data and vote records now come from the official Congress.gov API, which provides the same vote data via its actions endpoint.

**No user accounts** — RSVP uses email only. Keeps the MVP simple and avoids storing sensitive user data, but it means no follow-up notifications or saved bills. That's a planned future feature.

### Security

- Google Civic API key is IP-restricted — server-side only, never sent to the browser
- `/api/ingest` requires an `x-ingest-secret` header to prevent unauthorized triggering
- No user PII collected beyond an email address for event RSVPs
- Raw Prisma errors are never exposed to the client — API routes return generic error messages

### Scalability

- `force-dynamic` on all data pages keeps content fresh — accuracy matters more than cache performance for a civic information tool
- Prisma indexes on `topicTags`, `status`, and `introducedAt` keep filtering fast as the bill count grows
- Bill summaries are pre-generated and cached in the DB — AI costs don't scale with traffic
- Vercel cron runs ingestion daily at 6am UTC without any manual intervention

### Nonpartisanship by Design

This was a deliberate constraint throughout the build:

- AI prompts explicitly instruct neutral language and prohibit editorializing
- Official bill titles are always shown alongside AI summaries
- Stance cards display vote counts only — no framing, no commentary
- Users can flag summaries they think are biased; flag counts are stored for review

---

## How Kiro Was Used

This project was built using [Kiro](https://kiro.dev) with spec-driven development, steering docs, agent hooks, and Autopilot mode throughout.

### Spec-Driven Development

Before writing any code, the full feature spec was written in `.kiro/specs/civic-connect/`:

- `requirements.md` — functional and non-functional requirements
- `design.md` — architecture, data models, API routes, and the UI system

Having these in place before coding meant Kiro could reference them throughout the build to make consistent decisions about schema design, API structure, and component architecture. No architectural backtracking mid-build.

### Steering Docs

`.kiro/steering/` contains always-on context injected into every agent interaction automatically:

- `project-overview.md` — stack, conventions, env vars, run instructions
- `coding-standards.md` — component rules, API rules, nonpartisanship rules, styling rules

These acted as a persistent memory layer. Instead of repeating "use Tailwind only" or "server components fetch data directly" in every prompt, those rules were always present. It eliminated an entire class of inconsistency bugs across generated code.

### Agent Hooks

`.kiro/hooks/typecheck-on-save.kiro.hook` runs `tsc --noEmit` automatically whenever a `.ts` or `.tsx` file is saved — catching type errors immediately rather than at build time.

### Vibe Coding with Autopilot

The entire application — 25+ files including Prisma schema, 8 API routes, 8 React components, 5 pages, ingestion scripts, Docker setup, and all configuration — was built through natural language conversation with Kiro in Autopilot mode. The workflow was: describe what you want, review what Kiro produces, refine with follow-up prompts. Spec and steering docs provided the guardrails that kept output consistent across sessions.

---

## Learning Journey & Forward Thinking

### Challenges

- **ProPublica deprecation** — discovered mid-build that ProPublica's Congress API was shut down in 2024. Pivoted to Congress.gov's own vote endpoints with minimal disruption, but it required updating both the ingestion script and the design doc.
- **Next.js config format** — Next 14.2 doesn't support `next.config.ts`. The config needs to be `.mjs`. Small thing, but it caused a confusing build error early on.
- **Static prerendering with a database** — Next.js tries to statically prerender pages at build time. Any page that calls Prisma at build time fails without a database available. Fixed with `export const dynamic = "force-dynamic"` on every data page.
- **Structured AI output** — originally used Gemini's `responseMimeType: "application/json"` with regex parsing. Replaced with Vercel AI SDK's `generateObject()` which uses zod schemas for type-safe structured output across any provider — no regex parsing, no format inconsistencies.
- **Raw bill text quality** — Congress.gov "Formatted Text" is HTML-wrapped preformatted text with entity encoding, headers, and attestation blocks. Passing this directly to the LLM produced noisy summaries. Added a preprocessing step (`lib/bill-text.ts`) that strips HTML, removes boilerplate, normalizes whitespace, and truncates at section boundaries rather than mid-sentence.

### Lessons

Spec-first development pays off — having requirements and design documents written before any code was generated meant the architecture was decided upfront. There was no "wait, this doesn't fit the data model" moment halfway through.

Steering docs are underrated — injecting project conventions automatically into every agent interaction removed a whole category of bugs from inconsistent patterns across files. Worth spending time on these before starting a build.

Constraints produce better output — the nonpartisanship rules, the card-based UI system, and the "server components fetch data" rule all acted as creative constraints that made the codebase more coherent. Kiro worked better with clear rules than open-ended prompts.

### Future Plans

- **Phase 2** — richer stance cards with party platform excerpts and official press statements
- **Phase 3** — state-level legislation via NCSL API integration
- **Phase 4** — email/SMS alerts when bills you follow advance in Congress
- **Phase 5** — multilingual summaries (Spanish, Mandarin, Vietnamese) to reach non-English-speaking citizens
- **Bias audit dashboard** — admin view of flagged summaries with a review and correction workflow
- User accounts with saved bills and personalized topic feeds

---

## Setup & Running

### Prerequisites

- Docker Desktop
- API keys (see Environment Variables below)

### Quick Start (Docker)

```bash
git clone <your-repo-url>
cd civic-connect
cp .env.local.example .env.local   # fill in your API keys
docker compose up --build
```

App runs at `http://localhost:3000`. On first boot Docker will automatically:
1. Start PostgreSQL
2. Run `prisma db push` for the local Docker database
3. Run `npm run ingest` (fetch 20 bills + generate AI summaries)
4. Start the Next.js app

### Without Docker

```bash
npm install
npx prisma db push
npm run seed:orgs   # loads the advocacy organization directory
npm run ingest      # fetches 20 bills + generates AI summaries
npm run dev
```

### Local AI with Ollama (optional)

If you have a GPU and want to run summarization locally instead of using a cloud API:

```bash
curl -fsSL https://ollama.com/install.sh | sudo sh
ollama serve                    # in a separate terminal
ollama pull qwen3:4b            # or any model you prefer
```

Then set in `.env.local`:
```env
AI_PROVIDER=ollama
AI_MODEL=qwen3:4b
```

### Environment Variables

```env
CONGRESS_API_KEY=        # free at api.congress.gov
GOOGLE_CIVIC_API_KEY=    # console.cloud.google.com — use IP restriction
DATABASE_URL=            # postgresql://user:pass@host:5432/civicconnect
INGEST_SECRET=           # any random string

# AI Summarization — pick a provider
AI_PROVIDER=google       # "ollama", "google", "anthropic", or "openai"
AI_MODEL=gemini-2.0-flash  # model name for chosen provider

# For local dev with GPU (e.g. RTX 4090):
# AI_PROVIDER=ollama
# AI_MODEL=qwen3:4b

# Provider API keys (only need the one matching AI_PROVIDER)
GOOGLE_GEMINI_KEY=       # free at aistudio.google.com
# ANTHROPIC_API_KEY=     # console.anthropic.com
# OPENAI_API_KEY=        # platform.openai.com
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
2. Import repo in Vercel
3. Add all environment variables in Vercel dashboard
4. Add a Postgres database (Vercel Postgres or Neon)
5. Run schema changes separately:
   `npx prisma db push`
6. Deploy — `vercel.json` configures the daily cron automatically

---

## Data Sources

- [Congress.gov API](https://api.congress.gov) — U.S. Library of Congress, bill metadata, text, and vote records
- [Google Civic Information API](https://developers.google.com/civic-information) — representative lookup by address
- [Vercel AI SDK](https://sdk.vercel.ai) — unified AI provider interface (Ollama, Google Gemini, Anthropic Claude, OpenAI)

---

## References

- Kornilova & Eidelman (2019). BillSum: A Corpus for Automatic Summarization of US Legislation. EMNLP 2019.
- Martinez, Mollica & Gibson (2024). So Much for Plain Language. PNAS.
- Legal Lay Summarization (2025). Artificial Intelligence Review.
