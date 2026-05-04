import { NextRequest, NextResponse } from "next/server";
import { runMetadataIngest } from "@/lib/jobs/run-ingest";

// Metadata-only ingest — kept lightweight so scheduled runs finish quickly.
// Summaries, votes, and cosponsors are fetched on-demand when a user visits a bill.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}

async function runIngest() {
  try {
    const result = await runMetadataIngest();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Ingest job error:", error);
    return NextResponse.json(
      { error: error.message ?? "Ingest failed" },
      { status: 500 }
    );
  }
}
