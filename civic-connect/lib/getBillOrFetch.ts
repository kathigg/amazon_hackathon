/**
 * Fetch a bill from DB if cached, otherwise pull from Congress.gov,
 * store and return.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { fetchCosponsors } from "./congress";
import { classifyBillTaxonomy } from "./taxonomy/classify";
import { fetchBillVotes } from "./votes";
import { parseIntroducedDate } from "./bill-ingestion";

const BASE = "https://api.congress.gov/v3";
function getCongressApiKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

export async function getBillOrFetch(billId: string) {
  const existing = await getCachedBillById(billId);

  if (existing) {
    return existing;
  }

  const freshExisting = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });

  if (freshExisting) {
    return freshExisting;
  }

  if (process.env.ENABLE_ON_DEMAND_BILL_FETCH !== "true") {
    return null;
  }

  // Not in DB — parse billId format: {type}-{number}-{congress}
  const parts = billId.split("-");
  if (parts.length < 3) return null;

  const congress = Number(parts[parts.length - 1]);
  const number = parts[parts.length - 2];
  const type = parts.slice(0, parts.length - 2).join("-").toUpperCase();

  // Fetch from Congress.gov
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}?api_key=${getCongressApiKey()}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const bill = data.bill;
  if (!bill) return null;

  const policyArea: string | null = bill.policyArea?.name ?? null;
  const apiClassification = classifyBillTaxonomy({ policyArea }, bill.title ?? "");
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
      introducedAt: parseIntroducedDate(
        bill.introducedDate,
        bill.latestAction?.actionDate
      ),
      topicTags: apiClassification.topicTags,
      topicTagsSource: apiClassification.source,
      fullTextUrl: null,
      imageFetchedAt: null,
      viewCount: 0,
    },
  });

  // Never perform AI work in request paths. Summaries and enrichment run in
  // background ingest jobs only.
  void fetchAndStoreStances(created.id, congress, type, number);

  return prisma.bill.findUnique({
    where: { id: created.id },
    include: { summary: true, stances: true },
  });
}

const getCachedBillById = unstable_cache(
  async (billId: string) =>
    prisma.bill.findUnique({
      where: { id: billId },
      include: { summary: true, stances: true },
    }),
  ["bill-by-id"],
  { revalidate: 300 }
);

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
