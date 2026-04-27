import { NextRequest, NextResponse } from "next/server";
import { fetchRecentBills, fetchBillDetail } from "@/lib/congress";
import { inferTopics } from "@/lib/topics";
import { prisma } from "@/lib/prisma";

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
  const bills = await fetchRecentBills(119, 20);
  let ingested = 0;
  let skipped = 0;

  // Fetch all bill details in parallel to stay within the 60s window
  const results = await Promise.allSettled(
    bills.map(async (bill) => {
      const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
      const topicTags = inferTopics(bill.title);
      const detail = await fetchBillDetail(bill.congress, bill.type, bill.number);
      const sponsor = detail?.sponsor ?? bill.sponsors?.[0]?.fullName ?? "Unknown";

      // Parse introducedDate safely - handle missing or invalid dates
      let introducedAt = new Date();
      if (bill.introducedDate) {
        const parsed = new Date(bill.introducedDate);
        if (!isNaN(parsed.getTime())) {
          introducedAt = parsed;
        }
      }

      await prisma.bill.upsert({
        where: { id: billId },
        update: {
          sponsor,
          status: bill.latestAction?.text ?? "Unknown",
          updatedAt: new Date(),
        },
        create: {
          id: billId,
          congress: bill.congress,
          number: bill.number,
          type: bill.type,
          title: bill.title,
          sponsor,
          status: bill.latestAction?.text ?? "Unknown",
          introducedAt,
          topicTags,
          fullTextUrl: null,
        },
      });
    })
  );

  // Count successes and failures
  for (const result of results) {
    if (result.status === "fulfilled") {
      ingested++;
    } else {
      skipped++;
      console.error("Failed to ingest bill:", result.reason);
    }
  }

  return NextResponse.json({ ingested, skipped, total: bills.length });
}
