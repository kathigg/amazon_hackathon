# Representative Stance Scraping Setup

This document explains how the representative stance scraping system works and how to set it up.

## How It Works

1. **Daily Scraping (9am)**: A Vercel cron job runs every day at 9am
2. **Web Scraping**: Scrapes all 535 congressional websites (House + Senate)
3. **LLM Analysis**: Uses AWS Bedrock (Claude) to analyze content
4. **Stance Classification**: Determines 5-level stance for each bill:
   - Strong Support
   - Possible Support
   - Neutral/No Position
   - Possible Opposition
   - Strong Opposition
5. **Display**: Shows aggregated stances on bill detail pages

## Setup Instructions

### 1. Set Up AWS Bedrock

**Create IAM User:**
1. Go to AWS Console → IAM → Users
2. Create user: `civicconnect-bedrock`
3. Attach policy: `AmazonBedrockFullAccess` (or create custom policy)
4. Create access keys

**Request Model Access:**
1. Go to AWS Bedrock → Model access
2. Request access to: `Claude 3 Sonnet`
3. Wait for approval (usually instant)

### 2. Add Environment Variables to Vercel

```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJal...
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
CRON_SECRET=any_random_string
```

### 3. Seed Representatives Data

Run locally to populate all 535 representatives:

```bash
cd civic-connect
npm run seed:reps
```

This fetches data from Congress.gov API and creates representative records with their website URLs.

### 4. Trigger First Scrape

After deployment, manually trigger the first scrape:

```bash
curl -X POST https://your-app.vercel.app/api/scrape/representatives \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Or wait until 9am for the automatic cron job.

## How the Analysis Works

### Example 1: Explicit Statement
**Scraped content:** "I am proud to co-sponsor HR-1234, the Clean Water Act..."
**Analysis:** Strong Support (confidence: 0.95)

### Example 2: General Position
**Scraped content:** "I have always supported environmental protection..."
**Bill:** HR-5678 (Environmental Protection Act)
**Analysis:** Possible Support (confidence: 0.65)

### Example 3: No Information
**Scraped content:** No mention of the bill or related topics
**Analysis:** Neutral (confidence: 0.1)

### Example 4: Opposition
**Scraped content:** "I voted against HR-9999 because it would harm small businesses..."
**Analysis:** Strong Opposition (confidence: 0.90)

## Viewing Results

On any bill detail page (e.g., `/bill/hr-1234-119`), you'll see:

1. **Summary Bar**: Visual breakdown of support/neutral/oppose
2. **Stance Breakdown**: Count for each of the 5 levels
3. **Notable Positions**: List of representatives with high-confidence stances

## Cost Estimates

- **AWS Bedrock**: ~$0.008 per 1,000 tokens
- **Daily scraping**: 535 reps × 20 bills = ~10,700 analyses
- **Monthly cost**: ~$50-100
- **Your $1,000 credit**: Will last 10+ months

## Troubleshooting

### No stances showing up?

1. Check Vercel function logs for errors
2. Verify AWS credentials are correct
3. Confirm Bedrock model access is approved
4. Check that representatives were seeded: `npm run test:db`

### Low confidence scores?

This is normal! Many representatives don't explicitly state positions on every bill. The system will:
- Show "Neutral" for low confidence
- Only display high-confidence positions in "Notable Positions"
- Improve over time as more data is scraped

### Scraping taking too long?

The cron job processes 50 representatives per run to stay within Vercel's 5-minute limit. It prioritizes least-recently-scraped representatives, so all 535 will be covered over ~11 days.

## Manual Testing

Test a single representative:

```bash
curl https://your-app.vercel.app/api/scrape/representatives \
  -X POST \
  -H "x-cron-secret: YOUR_SECRET"
```

Check the logs in Vercel → Functions → `/api/scrape/representatives`

## Database Schema

```prisma
model Representative {
  id          String
  bioguideId  String @unique
  firstName   String
  lastName    String
  party       String  // D, R, I
  chamber     String  // house, senate
  state       String
  websiteUrl  String?
  lastScraped DateTime?
  stances     RepStance[]
}

model RepStance {
  id              String
  repId           String
  billId          String
  stance          String  // strong_support, possible_support, neutral, possible_reject, strong_reject
  confidence      Float
  reasoning       String?
  source          String  // scraped, inferred, vote
  scrapedAt       DateTime
}
```

## Future Improvements

- [ ] Add vote record integration (Congress.gov API)
- [ ] Track stance changes over time
- [ ] Email alerts for representatives changing positions
- [ ] Filter by state/district
- [ ] Export stance data as CSV
