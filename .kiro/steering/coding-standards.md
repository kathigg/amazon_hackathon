---
inclusion: always
---

# CivicConnect — Coding Standards

## Component Rules
- Server components fetch data directly via Prisma — no useEffect data fetching
- Client components (`"use client"`) are only for interactivity: forms, buttons, state
- Keep components small and single-purpose
- Card components (IssueCard, StanceCard, ActionCard) are the core UI primitives — extend them, don't replace them

## API Route Rules
- All API routes return `NextResponse.json()`
- Validate required params and return 400 for missing inputs
- Never expose raw Prisma errors to the client
- The `/api/ingest` route must check `x-ingest-secret` header

## Nonpartisanship Rules
- AI summarization prompts must always include neutral language instructions
- Stance cards show vote data only — never add editorial framing
- Both official bill title and AI summary must always be shown together

## Styling Rules
- Use Tailwind utility classes only — no inline styles
- Use the custom design tokens: `navy`, `cream`, `civic-red`, `civic-blue`, `civic-gold`
- Cards always use the `.card` component class (rounded-card + shadow-card + hover lift)
- Buttons use `.btn-primary` or `.btn-outline` classes
