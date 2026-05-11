/**
 * Fetch a bill from DB if cached, otherwise pull from Congress.gov,
 * store and return.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { fetchCosponsors, type CongressBill } from "./congress";
import { fetchBillVotes } from "./votes";
import { upsertBillMetadataFromCongress } from "./bill-ingestion";
import { fetchAssetUrlsForBills } from "./image-pool-read";

async function overlayCuratedImage<T extends { id: string; imageUrl: string | null } | null>(
  bill: T
): Promise<T> {
  if (!bill) return bill;
  const map = await fetchAssetUrlsForBills([bill.id]);
  const curated = map.get(bill.id);
  if (curated) bill.imageUrl = curated;
  return bill;
}

const BASE = "https://api.congress.gov/v3";
function getCongressApiKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

export async function getBillOrFetch(billId: string) {
  const existing = await getCachedBillById(billId);

  if (existing) {
    return overlayCuratedImage(existing);
  }

  const freshExisting = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });

  if (freshExisting) {
    return overlayCuratedImage(freshExisting);
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

  const sponsorEntry = bill.sponsors?.[0];
  const sponsorFullName = sponsorEntry
    ? sponsorEntry.fullName ??
      (`${sponsorEntry.firstName ?? ""} ${sponsorEntry.lastName ?? ""}`.trim() || undefined)
    : undefined;

  const synthetic: CongressBill = {
    congress,
    number,
    type,
    title: bill.title ?? billId,
    latestAction: {
      text: bill.latestAction?.text ?? "Unknown",
      actionDate: bill.latestAction?.actionDate ?? "",
      actionTime: bill.latestAction?.actionTime,
    },
    sponsors: sponsorFullName ? [{ fullName: sponsorFullName }] : [],
    url: bill.url ?? "",
  };

  const result = await upsertBillMetadataFromCongress(synthetic);
  if (result.skipped) {
    return null;
  }

  void fetchAndStoreStances(billId, congress, type, number);

  const stored = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });
  return overlayCuratedImage(stored);
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
