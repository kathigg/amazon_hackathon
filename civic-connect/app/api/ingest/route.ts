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

  // Fetch all bill details in parallel to stay within the 60s window
  await Promise.all(
    bills.map(async (bill) => {
      const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
      const topicTags = inferTopics(bill.title);
      const detail = await fetchBillDetail(bill.congress, bill.type, bill.number);
      const sponsor = detail?.sponsor ?? bill.sponsors?.[0]?.fullName ?? "Unknown";

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
          introducedAt: new Date(bill.introducedDate),
          topicTags,
          fullTextUrl: null,
        },
      });
      ingested++;
    })
  );

  return NextResponse.json({ ingested });
}
