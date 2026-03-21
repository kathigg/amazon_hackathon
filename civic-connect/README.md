# CivicConnect

> AI-powered U.S. legislative tracker — plain-language bill summaries, party stance comparisons, and civic action tools.

---

## Problem Statement

U.S. federal laws are written in dense legal language that most Americans cannot easily understand. Research confirms that federal legislation has become *less* accessible over time despite decades of plain-language mandates (Martinez et al., 2024). At the same time, grassroots civic movements struggle with decentralized coordination — people want to act but don't know how to connect with organizations or representatives working on the issues they care about.

CivicConnect solves this by translating active federal legislation into plain English, showing how each party has voted, and connecting citizens directly to advocacy organizations and their elected representatives.

---

## Target Users

- Citizens who want to understand what Congress is doing without a law degree
- First-time voters and young civic participants
- Advocacy organizations looking to reach engaged constituents
- Journalists and researchers tracking legislative activity

---

## Solution Summary

CivicConnect is a web-first platform modeled on [Bijak Memilih](https://bijakmemilih.id)'s card-based information architecture, adapted for the American political system. It presents information through three card types:

- **Issue Cards** — active bills with AI-generated plain-language summaries
- **Stance Cards** — side-by-side Democrat vs Republican vote breakdowns
- **Action Cards** — matched advocacy organizations, upcoming events, and one-click representative contact

---

## Key Features

- Live bill data from the Congress.gov API (119th Congress)
- Google Gemini 1.5 Flash generates plain-language summaries at an 8th-grade reading level
- Official bill title always shown alongside AI summary for transparency
- User feedback mechanism to flag potentially biased summaries
- Party vote breakdowns sourced from Congress.gov recorded votes
- Advocacy organization directory with event listings and RSVP
- Representative lookup by ZIP code via Google Civic Information API
- Search and filter bills by topic area (12 categories)
- Fully responsive — mobile-first design
- Daily automated bill ingestion via Vercel cron

---

## Architecture

```
Browser
  └── Next.js 14 App Router (server + client components)
        ├── /bills, /bill/[id]     — Issue + Stance + Action cards
        ├── /orgs, /orgs/register  — Advocacy org directory
        ├── /bill/[id]/contact     — Rep contact by ZIP
        └── /api/*                 — API routes (bills, orgs, reps, ingest)
              ├── Congress.gov API     — bill metadata, text, votes
              ├── Google Gemini API    — AI summarization
              └── Google Civic API    — representative lookup
        └── Prisma ORM → PostgreSQL
```

### Design Decisions

**Next.js App Router (full-stack)**
Consolidates frontend and backend into a single deployable unit. Server components fetch data directly from Postgres with zero client-side waterfalls. API routes handle mutations and external API proxying.

**Google Gemini 1.5 Flash**
Free tier (15 RPM, 1M TPM/day) is sufficient for batch ingestion of 250 bills. `responseMimeType: "application/json"` enforces structured output without prompt engineering overhead. Temperature 0.2 keeps summaries factual and consistent.

**Congress.gov API only (no ProPublica)**
ProPublica's Congress API was deprecated in 2024. All bill data and vote records now come exclusively from the official Congress.gov API, which provides the same vote data via `/bill/{congress}/{type}/{number}/actions`.

**Nonpartisanship by design**
- AI prompts explicitly instruct neutral language
- Official title always shown alongside AI summary
- Stance cards display vote counts only — no editorial framing
- Users can flag summaries; flag counts are stored for admin review

**Security**
- Google Civic API key is IP-restricted (server-side only, never exposed to browser)
- `/api/ingest` is protected by `INGEST_SECRET` header
- No user PII collected — RSVP uses email only, no accounts required

**Scalability**
- `force-dynamic` pages render on demand — no stale static data
- Vercel cron runs ingestion daily at 6am UTC
- Prisma indexes on `topicTags`, `status`, `introducedAt` for fast filtering
- Bill summaries are pre-generated and cached in DB — no LLM calls at page load

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
2. Run `prisma db push` (create tables)
3. Run `npm run ingest` (fetch 250 bills + generate AI summaries)
4. Start the Next.js app

### Without Docker

```bash
npm install
npx prisma db push
npm run ingest
npm run dev
```

### Environment Variables

```env
CONGRESS_API_KEY=        # free at api.congress.gov
GOOGLE_GEMINI_KEY=       # free at aistudio.google.com
GOOGLE_CIVIC_API_KEY=    # console.cloud.google.com — use IP restriction
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
2. Import repo in Vercel
3. Add all environment variables in Vercel dashboard
4. Add a Postgres database (Vercel Postgres or Neon)
5. Deploy — `vercel.json` configures the daily cron automatically

---

## Kiro Usage

This project was built using [Kiro](https://kiro.dev) with spec-driven development, steering docs, and agent hooks.

### Spec-Driven Development
The full feature spec lives in `.kiro/specs/civic-connect/`:
- `requirements.md` — functional and non-functional requirements
- `design.md` — high-level architecture, data models, API routes, UI system

Kiro used these specs to guide implementation decisions throughout the build — from Prisma schema design to API route structure to component architecture.

### Steering Docs
`.kiro/steering/` contains always-on context injected into every agent interaction:
- `project-overview.md` — stack, conventions, env vars, run instructions
- `coding-standards.md` — component rules, API rules, nonpartisanship rules, styling rules

These ensured consistent patterns across all generated code without repeating instructions.

### Agent Hooks
`.kiro/hooks/typecheck-on-save.json` — automatically runs `tsc --noEmit` whenever a `.ts` or `.tsx` file is edited, catching type errors immediately.

### Vibe Coding
The entire application — 25+ files including Prisma schema, 8 API routes, 8 React components, 5 pages, ingestion scripts, Docker setup, and all configuration — was built through natural language conversation with Kiro in Autopilot mode.

---

## Learning Journey & Forward Thinking

### Challenges
- **ProPublica deprecation** — discovered mid-build that ProPublica's Congress API was shut down. Pivoted to Congress.gov's own vote endpoints with minimal disruption.
- **Next.js config format** — Next 14.2 doesn't support `next.config.ts`; required `.mjs` format.
- **Static prerendering with DB** — build-time Prisma calls fail without a DB. Solved with `force-dynamic` on all data pages.

### Lessons
- Spec-first development pays off — having `requirements.md` and `design.md` written before coding meant zero architectural backtracking.
- Steering docs are underrated — injecting project conventions automatically eliminated an entire class of inconsistency bugs.

### Future Plans
- **Phase 2**: Richer stance cards with party platform excerpts and official press statements
- **Phase 3**: State-level legislation (NCSL API integration)
- **Phase 4**: Email/SMS alerts when bills you follow advance
- **Phase 5**: Multilingual summaries (Spanish, Mandarin, Vietnamese) to reach non-English-speaking citizens
- **Bias audit dashboard**: Admin view of flagged summaries with review workflow

---

## Data Sources

- [Congress.gov API](https://api.congress.gov) — U.S. Library of Congress
- [Google Civic Information API](https://developers.google.com/civic-information) — representative lookup
- [Google Gemini API](https://aistudio.google.com) — AI summarization

---

## References

- Kornilova & Eidelman (2019). BillSum: A Corpus for Automatic Summarization of US Legislation. EMNLP 2019.
- Martinez, Mollica & Gibson (2024). So Much for Plain Language. PNAS.
- Legal Lay Summarization (2025). Artificial Intelligence Review.
