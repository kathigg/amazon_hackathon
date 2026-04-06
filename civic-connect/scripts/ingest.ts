/**
 * Bill ingestion script — run with: npm run ingest
 * Fetches bills from Congress.gov, upserts to DB, triggers summarization.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { fetchRecentBills, fetchBillText, fetchBillDetail, fetchCosponsors } from "../lib/congress";
import { fetchBillVotes } from "../lib/votes";
import { summarizeBill } from "../lib/summarize";
import { preprocessBillText } from "../lib/bill-text";
import { inferTopics } from "../lib/topics";

async function main() {
  console.log("Starting bill ingestion...");
  const bills = await fetchRecentBills(119, 20);
  console.log(`Fetched ${bills.length} bills from Congress.gov`);

  for (const bill of bills) {
    const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
    const topicTags = inferTopics(bill.title);

    // Fetch detail for accurate sponsor name (list endpoint doesn't include it)
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
          if (textRes.ok) billText = preprocessBillText(await textRes.text());
        }
        const summary = await summarizeBill(bill.title, billText);
        await prisma.summary.create({
          data: {
            billId,
            plainLanguage: summary.plainLanguage,
            keyProvisions: summary.keyProvisions,
            whyItMatters: summary.whyItMatters,
          },
        });
        console.log(`  ✓ Summarized: ${billId}`);
      } catch (err) {
        console.error(`  ✗ Summary failed for ${billId}:`, err);
      }
    }

    // Fetch vote data and cosponsor counts for stance cards
    try {
      const [votes, cosponsors] = await Promise.all([
        fetchBillVotes(bill.congress, bill.type, bill.number),
        fetchCosponsors(bill.congress, bill.type, bill.number),
      ]);

      for (const [party, voteData, cosponsorCount] of [
        ["Democrat", votes?.democratic ?? { yes: 0, no: 0 }, cosponsors.democratic],
        ["Republican", votes?.republican ?? { yes: 0, no: 0 }, cosponsors.republican],
      ] as const) {
        await prisma.stance.upsert({
          where: { id: `${billId}-${party}` },
          update: {
            voteYes: voteData.yes,
            voteNo: voteData.no,
            cosponsors: cosponsorCount,
          },
          create: {
            id: `${billId}-${party}`,
            billId,
            party,
            position: "",
            voteYes: voteData.yes,
            voteNo: voteData.no,
            cosponsors: cosponsorCount,
            source: votes ? "vote_record" : "cosponsors",
          },
        });
      }
      console.log(`  ✓ Stances: ${billId} (D cosponsors: ${cosponsors.democratic}, R cosponsors: ${cosponsors.republican})`);
    } catch (err) {
      console.error(`  ✗ Stance fetch failed for ${billId}:`, err);
    }
  }

  console.log("Ingestion complete.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
