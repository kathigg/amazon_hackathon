import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasCongressKey: !!process.env.CONGRESS_API_KEY,
      hasBedrockModel: !!process.env.AWS_BEDROCK_MODEL,
      hasSesFromEmail: !!process.env.SES_FROM_EMAIL,
      hasIngestSecret: !!process.env.INGEST_SECRET,
    },
  });
}
