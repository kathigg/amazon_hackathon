import { NextRequest, NextResponse } from "next/server";
import { fetchRecentBills, fetchBillText } from "@/lib/congress";
import { fetchBillVotes } from "@/lib/votes";
import { summarizeBill } from "@/lib/summarize";
import { inferTopics } from "@/lib/topics";
import { prisma } from "@/lib/prisma";

// Protect with a simple secret header
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bills = await fetchRecentBills(119, 250);
  let ingested = 0;
  let summarized = 0;

  for (const bill of bills) {
    const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
    const topicTags = inferTopics(bill.title);

    await prisma.bill.upsert({
      where: { id: billId },
      update: { status: bill.latestAction?.text ?? "Unknown", updatedAt: new Date() },
      create: {
        id: billId,
        congress: bill.congress,
        number: bill.number,
        type: bill.type,
        title: bill.title,
        sponsor: bill.sponsors?.[0]?.fullName ?? "Unknown",
        status: bill.latestAction?.text ?? "Unknown",
        introducedAt: new Date(bill.introducedDate),
        topicTags,
        fullTextUrl: null,
      },
    });
    ingested++;

    const existing = await prisma.summary.findUnique({ where: { billId } });
    if (!existing) {
      try {
        const textUrl = await fetchBillText(bill.congress, bill.type, bill.number);
        let billText = bill.title;
        if (textUrl) {
          const textRes = await fetch(textUrl);
          if (textRes.ok) billText = await textRes.text();
        }
        const summary = await summarizeBill(bill.title, billText);
        await prisma.summary.create({
          data: { billId, plainLanguage: summary.plainLanguage, keyProvisions: summary.keyProvisions },
        });
        summarized++;
      } catch {
        // non-fatal
      }
    }

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
      // non-fatal
    }
  }

  return NextResponse.json({ ingested, summarized });
}
