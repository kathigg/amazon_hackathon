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
      emailDeliveryEnabled:
        process.env.EMAIL_DELIVERY_ENABLED === "true" ||
        process.env.EMAIL_SEND_MODE === "live",
      hasIngestSecret: !!process.env.INGEST_SECRET,
    },
  });
}
