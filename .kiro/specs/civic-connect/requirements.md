# CivicConnect — Requirements

## Functional Requirements

### FR-1: Bill Data Ingestion
- The system shall fetch active federal bills from the Congress.gov API (119th Congress)
- The system shall supplement bill data with vote records from the ProPublica Congress API
- Bills shall be upserted into the database daily via a scheduled job
- Each bill record shall include: id, title, sponsor, status, introduced date, topic tags, and full text URL

### FR-2: AI-Powered Summarization
- The system shall generate a plain-language summary for each ingested bill using an LLM (GPT-4o)
- Summaries shall target an 8th-grade reading level
- Each summary shall include a 2–3 sentence plain description and 3–5 key provisions
- Both the official bill title and the AI summary shall be displayed side-by-side on the bill page
- Users shall be able to flag a summary as potentially biased via a one-click feedback button
- Flagged summaries shall increment a flag counter stored in the database for admin review

### FR-3: Issue Cards
- The system shall display bills as "Issue Cards" in a card-based grid layout
- Each Issue Card shall show: bill title, plain-language summary, legislative status badge, sponsor name, and topic tags
- Users shall be able to search bills by keyword
- Users shall be able to filter bills by topic area (e.g., Healthcare, Economy, Environment, Education, Immigration)
- The bill detail page shall show the full summary, key provisions, and status timeline

### FR-4: Stance Cards (Phase 2)
- The system shall display party positions on each bill as "Stance Cards"
- Stance Cards shall show Democratic and Republican positions side-by-side
- Party positions shall be derived from: ProPublica vote breakdowns, party platform excerpts, and official statements
- Stance Cards shall present information factually without editorial framing

### FR-5: Advocacy Org Directory (Phase 3)
- Organizations shall be able to register a profile (name, mission, website, topic tags, location)
- Organizations shall be able to post events (town halls, letter-writing campaigns, protests)
- Users shall be able to RSVP to events via email (no account required)
- Organizations shall be matched to bills via shared topic tags
- Action Cards on bill pages shall surface relevant orgs and upcoming events

### FR-6: Representative Contact (Phase 4)
- Users shall be able to enter their zip code to look up their federal representatives
- The system shall display the user's two U.S. Senators and one House Representative
- Each bill page shall include a pre-drafted contact message users can customize
- The system shall link to each representative's official contact form

---

## Non-Functional Requirements

### NFR-1: Performance
- Bill listing pages shall load within 2 seconds on a standard broadband connection
- AI summaries shall be pre-generated and cached; no on-demand LLM calls during page load

### NFR-2: Neutrality & Bias Mitigation
- AI summarization prompts shall explicitly instruct the model to use neutral language
- Flagged summaries exceeding a threshold shall be queued for human review
- Party stance data shall cite its source (vote record, platform, statement)

### NFR-3: Responsiveness
- All pages shall be fully functional on mobile browsers (320px minimum width)
- Layout shall adapt: 3-column grid on desktop, 2-column on tablet, 1-column on mobile

### NFR-4: Accessibility
- All interactive elements shall have appropriate ARIA labels
- Color contrast shall meet minimum readability standards
- Cards shall be keyboard-navigable

### NFR-5: Scalability
- The system shall support at least 50 active bills at MVP launch
- Database queries shall use indexed fields (billId, topicTags, status) for pagination performance

---

## Out of Scope (MVP)
- User accounts / authentication
- State-level legislation
- Real-time bill tracking notifications
- Mobile native app
