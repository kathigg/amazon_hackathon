import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasCongressKey: !!process.env.CONGRESS_API_KEY,
      hasGeminiKey: !!process.env.GOOGLE_GEMINI_KEY,
      hasIngestSecret: !!process.env.INGEST_SECRET,
      databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + "...",
    }
  });
}
