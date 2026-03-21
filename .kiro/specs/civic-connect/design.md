# CivicConnect — Technical Design

## Overview

CivicConnect is a Next.js web platform that makes U.S. federal legislation accessible through AI-generated plain-language summaries, party stance comparisons, and civic action pathways. The UI is modeled on Bijak Memilih's card-based architecture.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Next.js App (App Router)            │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │
│  │  Pages   │  │  API     │  │  Server        │    │
│  │  /bills  │  │  Routes  │  │  Components    │    │
│  │  /bill/  │  │  /api/   │  │  (RSC)         │    │
│  │  /orgs   │  │  bills   │  │                │    │
│  │  /reps   │  │  summary │  │                │    │
│  └──────────┘  │  orgs    │  └────────────────┘    │
│                │  reps    │                         │
│                └──────────┘                         │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────────┐
│   PostgreSQL    │  │   External APIs      │
│   (via Prisma)  │  │                      │
│                 │  │  - Congress.gov API  │
│  - bills        │  │  - ProPublica API    │
│  - summaries    │  │  - OpenAI API        │
│  - stances      │  │  - Google Civic API  │
│  - orgs         │  └──────────────────────┘
│  - events       │
│  - feedback     │
└─────────────────┘
```

---

## System Components

### 1. Data Ingestion Layer

A background job (Next.js cron via Vercel, or a standalone Node script) fetches bills from Congress.gov and ProPublica APIs on a scheduled basis (daily). Bills are upserted into PostgreSQL via Prisma.

- Congress.gov API: bill metadata, status, sponsor, full text URL
- ProPublica Congress API: vote records, party voting breakdowns
- Deduplication by `billId` (e.g., `hr-1234-119`)

### 2. AI Summarization Service

On bill ingest (or on-demand), an API route calls OpenAI (GPT-4o) with the bill's full text or summary text to generate:
- A plain-language description (2–3 sentences, 8th grade reading level)
- 3–5 key provisions as bullet points
- A neutral framing check prompt to reduce bias

Summaries are stored in the DB and served from cache. Users can flag summaries as biased via a feedback endpoint.

### 3. Card-Based UI System

Three card types, mirroring Bijak Memilih's visual language:

| Card Type | Content | Route |
|-----------|---------|-------|
| Issue Card | Bill title, AI summary, status, sponsor, topic tags | `/bills`, `/bill/[id]` |
| Stance Card | Party positions side-by-side (D vs R), vote breakdown | `/bill/[id]#stances` |
| Action Card | Advocacy orgs, events, rep contact | `/bill/[id]#action` |

### 4. Civic Context (Stance Cards)

Party stances are derived from:
- ProPublica vote data (party-line vote percentages)
- Manually curated party platform excerpts (stored in DB)
- Official press statements (admin-entered)

Displayed as a neutral side-by-side comparison — no editorializing.

### 5. Advocacy Org Directory

Organizations register via a simple form. Each org has:
- Profile (name, mission, issue tags, location)
- Events (town halls, letter-writing campaigns, protests)
- RSVP functionality (email-based, no auth required for MVP)

Matched to bills via shared topic tags.

### 6. Representative Contact

Uses Google Civic Information API to look up reps by zip code. Each bill page shows:
- Relevant senators and house rep for the user's district
- Pre-drafted contact message (customizable)
- Links to official contact forms

---

## Low-Level Design

### Data Models (Prisma Schema)

```prisma
model Bill {
  id          String   @id  // e.g. "hr-1234-119"
  congress    Int
  number      String
  type        String       // HR, S, HJRES, etc.
  title       String
  sponsor     String
  status      String
  introducedAt DateTime
  topicTags   String[]
  fullTextUrl String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  summary     Summary?
  stances     Stance[]
  feedback    Feedback[]
}

model Summary {
  id            String   @id @default(cuid())
  billId        String   @unique
  bill          Bill     @relation(fields: [billId], references: [id])
  plainLanguage String   // 2-3 sentence plain summary
  keyProvisions String[] // bullet points
  generatedAt   DateTime @default(now())
  flagCount     Int      @default(0)
}

model Stance {
  id        String @id @default(cuid())
  billId    String
  bill      Bill   @relation(fields: [billId], references: [id])
  party     String // "Democrat" | "Republican" | "Independent"
  position  String // plain text position statement
  voteYes   Int    @default(0)
  voteNo    Int    @default(0)
  source    String // "vote_record" | "platform" | "statement"
}

model Organization {
  id          String   @id @default(cuid())
  name        String
  mission     String
  website     String?
  topicTags   String[]
  location    String?
  events      Event[]
  createdAt   DateTime @default(now())
}

model Event {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id])
  title     String
  type      String   // "town_hall" | "letter_writing" | "protest" | "other"
  date      DateTime
  location  String
  rsvps     Rsvp[]
}

model Rsvp {
  id      String @id @default(cuid())
  eventId String
  event   Event  @relation(fields: [eventId], references: [id])
  email   String
}

model Feedback {
  id        String   @id @default(cuid())
  billId    String
  bill      Bill     @relation(fields: [billId], references: [id])
  reason    String
  createdAt DateTime @default(now())
}
```

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/bills` | List bills with pagination, search, topic filter |
| GET | `/api/bills/[id]` | Single bill with summary + stances |
| POST | `/api/bills/[id]/feedback` | Flag a summary as biased |
| GET | `/api/orgs` | List orgs, filter by topic/location |
| POST | `/api/orgs` | Register a new org |
| POST | `/api/events/[id]/rsvp` | RSVP to an event |
| GET | `/api/reps` | Look up reps by zip (proxies Google Civic API) |
| POST | `/api/ingest` | Trigger bill ingestion (cron/admin only) |
| POST | `/api/summarize/[id]` | Trigger AI summarization for a bill |

### Key Algorithms

**Bill Ingestion Flow:**
```
1. Fetch /v3/bill?congress=119&limit=250 from Congress.gov
2. For each bill: upsert into DB by billId
3. If bill has no summary → enqueue summarization job
4. Fetch ProPublica vote data → upsert Stance records
```

**AI Summarization Flow:**
```
1. Fetch bill full text (from Congress.gov text endpoint)
2. If text > 8000 tokens → chunk and summarize-then-reduce
3. Prompt: "Summarize this bill in plain English at an 8th grade 
   reading level. Be neutral. Return JSON: 
   { plainLanguage: string, keyProvisions: string[] }"
4. Validate JSON response → store in Summary table
```

**Rep Lookup Flow:**
```
1. User enters zip code
2. GET /api/reps?zip=XXXXX
3. Server calls Google Civic API: 
   /civicinfo/v2/representatives?address=XXXXX
4. Filter for federal offices (US Senate, US House)
5. Return name, party, photo, contact URL
```

---

## UI Design System

Inspired by Bijak Memilih's clean, card-forward aesthetic:

- Color palette: Deep navy (`#0A1628`) + warm white (`#F8F7F4`) + accent red (`#C0392B`) and blue (`#2E4A8F`)
- Typography: Inter for UI, Playfair Display for hero headings
- Cards: rounded corners (16px), subtle drop shadow, hover lift animation
- Layout: CSS Grid, responsive — 3 cols desktop → 2 cols tablet → 1 col mobile
- Navigation: sticky top nav with search bar + topic filter chips
- Hero section: full-width banner with tagline and CTA

### Page Structure

```
/ (Home)
  └── Hero + tagline
  └── Featured bills (3 issue cards)
  └── How it works section
  └── Topic filter grid

/bills
  └── Search bar
  └── Topic filter chips (Healthcare, Economy, Environment, etc.)
  └── Bill cards grid (paginated)

/bill/[id]
  └── Issue Card (full detail)
  └── Stance Cards (D vs R side-by-side)
  └── Action Cards (orgs + rep contact)

/orgs
  └── Org directory with topic filters
  └── Upcoming events list

/about
  └── Mission, methodology, bias policy
```

---

## Phased Roadmap

| Phase | Scope |
|-------|-------|
| Phase 1 (MVP) | Bill ingestion + AI summaries + Issue Cards UI |
| Phase 2 | Stance Cards (party positions + vote data) |
| Phase 3 | Advocacy org directory + events + RSVP |
| Phase 4 | Rep contact tool (Google Civic API) |

---

## Environment Variables Required

```env
CONGRESS_API_KEY=
PROPUBLICA_API_KEY=
OPENAI_API_KEY=
GOOGLE_CIVIC_API_KEY=
DATABASE_URL=
```
