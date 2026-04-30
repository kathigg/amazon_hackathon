import { NextRequest, NextResponse } from "next/server";
import {
  fetchBillsForMetadataIngest,
  upsertBillMetadataFromCongress,
} from "@/lib/bill-ingestion";

// Metadata-only ingest — fast enough to fit in Vercel's 60s cron limit.
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
  const bills = await fetchBillsForMetadataIngest(119);
  let ingested = 0;
  let skipped = 0;
  let breaking = 0;

  const results = await Promise.allSettled(
    bills.map((bill) => upsertBillMetadataFromCongress(bill))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      ingested++;
      if (result.value.breakingTriggered) {
        breaking++;
      }
    } else {
      skipped++;
      console.error("Failed to ingest bill:", result.reason);
    }
  }

  return NextResponse.json({ ingested, skipped, breaking, total: bills.length });
}
