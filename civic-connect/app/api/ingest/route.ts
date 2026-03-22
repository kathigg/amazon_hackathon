import { NextRequest, NextResponse } from "next/server";
import { fetchRecentBills, fetchBillDetail } from "@/lib/congress";
import { fetchBillVotes } from "@/lib/votes";
import { inferTopics } from "@/lib/topics";
import { prisma } from "@/lib/prisma";

// Tell Vercel this function can run up to 60s (Hobby plan max)
export const maxDuration = 60;

// Vercel Cron sends GET — check CRON_SECRET
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}

// Manual trigger — check x-ingest-secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}

async function runIngest() {
  const bills = await fetchRecentBills(119, 250);
  let ingested = 0;

  for (const bill of bills) {
    const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
    const topicTags = inferTopics(bill.title);

    // Fetch accurate sponsor name from detail endpoint
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

    // Upsert vote stances (fast, no AI — safe within timeout)
    try {
      const votes = await fetchBillVotes(bill.congress, bill.type, bill.number);
      if (votes) {
        for (const [party, data] of [
          ["Democrat", votes.democratic],
          ["Republican", votes.republican],
        ] as const) {
          await prisma.stance.upsert({
            where: { id: `${billId}-${party}` },
            update: { voteYes: data.yes, voteNo: data.no },
            create: {
              id: `${billId}-${party}`,
              billId,
              party,
              position: "",
              voteYes: data.yes,
              voteNo: data.no,
              source: "vote_record",
            },
          });
        }
      }
    } catch {
      // vote data is optional
    }
  }

  // Summaries are generated on-demand in getBillOrFetch when a user visits a bill
  return NextResponse.json({ ingested });
}
