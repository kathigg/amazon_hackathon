# AWS Bedrock Setup for Claude 4.5 Haiku

## Quick Setup Steps

### 1. Enable Model Access in AWS Console

1. Go to: https://console.aws.amazon.com/bedrock
2. **Important**: Make sure you're in **us-east-1** region (top right corner)
3. Click **"Model catalog"** in the left sidebar
4. Search for **"Claude Haiku 4.5"**
5. Open the model card and use the **Programmatic access** section to confirm the model ID
6. If prompted, complete the Anthropic first-time use form and any subscription/enablement steps
7. Wait a few minutes for access to finish propagating

### 2. Verify Model ID

For on-demand invocation, use the US inference profile ID:
```
us.anthropic.claude-haiku-4-5-20251001-v1:0
```

Important:
- The model detail page may show the base model ID `anthropic.claude-haiku-4-5-20251001-v1:0`
- That base ID is not valid for this app's on-demand calls
- If you use the base ID, Bedrock returns a validation error telling you to use an inference profile
- Keep `AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0` for this project

### 3. Update Vercel Environment Variables

Go to your Vercel project settings and update:
```
AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

### 4. Test Locally

Run the test script to verify everything works:
```bash
cd civic-connect
npx tsx scripts/test-scrape-one.ts
```

You should see:
- ✓ Scraped website content
- 🤖 Analyzing stance with AWS Bedrock...
- 📊 Analysis Result with stance, confidence, and reasoning
- 💾 Stored in database

### 5. Deploy

Once the test works locally, deploy to Vercel:
```bash
git add .
git commit -m "Configure Claude 4.5 Haiku for representative stance analysis"
git push
```

The cron job will automatically run daily at 9am.

## Troubleshooting

### "Access denied" or "Legacy model" error
- Make sure you enabled model access in Step 1
- Verify you're in the **us-east-1** region
- Confirm the IAM user or role can use `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions`
- For Anthropic models, complete the first-time use form if AWS prompts for it
- Wait a few minutes after enabling access

### "Model not found" error
- Check the exact model ID in AWS Bedrock console
- Model IDs can vary by region
- Try these alternatives:
  - `us.anthropic.claude-haiku-4-5-20251001-v1:0`
  - `global.anthropic.claude-haiku-4-5-20251001-v1:0`

### "Invalid credentials" error
- Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correct
- Check that the IAM user has `AmazonBedrockFullAccess` policy

## Cost Estimates

Claude 4.5 Haiku pricing (as of 2025):
- Input: ~$0.25 per 1M tokens
- Output: ~$1.25 per 1M tokens

Daily scraping cost estimate:
- 50 reps × 20 bills = 1,000 analyses per day
- ~4,000 input tokens + 200 output tokens per analysis
- Daily cost: ~$1.25
- Monthly cost: ~$37.50
- **Your $1,000 credit will last ~26 months**

## What Happens Next

Once enabled, the system will:
1. **Daily at 9am**: Scrape 50 representative websites
2. **Analyze**: Use Claude 4.5 Haiku to determine stances on 20 recent bills
3. **Store**: Save high-confidence stances (>30%) in database
4. **Display**: Show aggregated stances on bill detail pages

It takes ~11 days to scrape all 551 representatives, then the cycle repeats.
