/**
 * Fetch a bill from DB if cached, otherwise pull from Congress.gov,
 * summarize with Gemini, store, and return. Also increments viewCount.
 */
import { prisma } from "./prisma";
import { fetchBillText, fetchCosponsors } from "./congress";
import { summarizeBill } from "./summarize";
import { inferTopics } from "./topics";
import { fetchBillVotes } from "./votes";

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY!;
const BASE = "https://api.congress.gov/v3";

export async function getBillOrFetch(billId: string) {
  // Increment view count if bill exists
  const existing = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });

  if (existing) {
    // Fire-and-forget: increment view count
    prisma.bill.update({
      where: { id: billId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    // Generate summary on-demand if missing
    if (!existing.summary) {
      await generateAndStoreSummary(existing.id, existing.title, existing.congress, existing.type, existing.number);
    }

    // Fetch stances on-demand if missing (bill was ingested before stance data was available)
    if (existing.stances.length === 0) {
      await fetchAndStoreStances(billId, existing.congress, existing.type, existing.number);
    }

    return prisma.bill.findUnique({
      where: { id: billId },
      include: { summary: true, stances: true },
    });
  }

  // Not in DB — parse billId format: {type}-{number}-{congress}
  const parts = billId.split("-");
  if (parts.length < 3) return null;

  const congress = Number(parts[parts.length - 1]);
  const number = parts[parts.length - 2];
  const type = parts.slice(0, parts.length - 2).join("-").toUpperCase();

  // Fetch from Congress.gov
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}?api_key=${CONGRESS_API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const bill = data.bill;
  if (!bill) return null;

  const topicTags = inferTopics(bill.title ?? "");
  const s = bill.sponsors?.[0];
  const sponsor = s
    ? (s.fullName ?? (`${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "Unknown"))
    : "Unknown";
  const status = bill.latestAction?.text ?? "Unknown";

  const created = await prisma.bill.create({
    data: {
      id: billId,
      congress,
      number,
      type,
      title: bill.title ?? billId,
      sponsor,
      status,
      introducedAt: new Date(bill.introducedDate ?? Date.now()),
      topicTags,
      fullTextUrl: null,
      viewCount: 1,
    },
  });

  // Summarize in background (awaited so first visitor sees it)
  await generateAndStoreSummary(created.id, created.title, congress, type, number);

  // Fetch vote stances and cosponsors
  await fetchAndStoreStances(billId, congress, type, number);

  return prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });
}

async function fetchAndStoreStances(
  billId: string,
  congress: number,
  type: string,
  number: string
) {
  try {
    const [votes, cosponsors] = await Promise.all([
      fetchBillVotes(congress, type, number),
      fetchCosponsors(congress, type, number),
    ]);

    for (const [party, voteData, cosponsorCount] of [
      ["Democrat", votes?.democratic ?? { yes: 0, no: 0 }, cosponsors.democratic],
      ["Republican", votes?.republican ?? { yes: 0, no: 0 }, cosponsors.republican],
    ] as const) {
      await prisma.stance.upsert({
        where: { id: `${billId}-${party}` },
        update: { voteYes: voteData.yes, voteNo: voteData.no, cosponsors: cosponsorCount },
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
  } catch { /* non-fatal */ }
}

async function generateAndStoreSummary(
  billId: string,
  title: string,
  congress: number,
  type: string,
  number: string
) {
  try {
    const textUrl = await fetchBillText(congress, type, number);
    let billText = title;
    if (textUrl) {
      const r = await fetch(textUrl);
      if (r.ok) billText = await r.text();
    }
    const summary = await summarizeBill(title, billText);
    await prisma.summary.upsert({
      where: { billId },
      update: { plainLanguage: summary.plainLanguage, keyProvisions: summary.keyProvisions, whyItMatters: summary.whyItMatters },
      create: { billId, plainLanguage: summary.plainLanguage, keyProvisions: summary.keyProvisions, whyItMatters: summary.whyItMatters },
    });
  } catch { /* non-fatal */ }
}
