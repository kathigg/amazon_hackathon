/**
 * Bill ingestion script — run with: npm run ingest
 * Fetches bills from Congress.gov, upserts to DB, triggers summarization.
 */
import { prisma } from "../lib/prisma";
import { fetchRecentBills, fetchBillText } from "../lib/congress";
import { fetchBillVotes } from "../lib/votes";
import { summarizeBill } from "../lib/summarize";
import { inferTopics } from "../lib/topics";

async function main() {
  console.log("Starting bill ingestion...");
  const bills = await fetchRecentBills(119, 250);
  console.log(`Fetched ${bills.length} bills from Congress.gov`);

  for (const bill of bills) {
    const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
    const topicTags = inferTopics(bill.title);

    await prisma.bill.upsert({
      where: { id: billId },
      update: {
        status: bill.latestAction?.text ?? "Unknown",
        updatedAt: new Date(),
      },
      create: {
        id: billId,
        congress: bill.congress,
        number: bill.number,
        type: bill.type,
        title: bill.title,
        sponsor: bill.sponsors?.[0]?.fullName ?? "Unknown",
        status: bill.latestAction?.text ?? "Unknown",
        introducedAt: bill.introducedDate ? new Date(bill.introducedDate) : new Date(),
        topicTags,
        fullTextUrl: null,
      },
    });

    // Summarize if no summary exists yet
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
          data: {
            billId,
            plainLanguage: summary.plainLanguage,
            keyProvisions: summary.keyProvisions,
          },
        });
        console.log(`  ✓ Summarized: ${billId}`);
      } catch (err) {
        console.error(`  ✗ Summary failed for ${billId}:`, err);
      }
    }

    // Fetch vote data for stance cards
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
      // Vote data is optional — continue
    }
  }

  console.log("Ingestion complete.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
