/**
 * Fetch a bill from DB if cached, otherwise pull from Congress.gov,
 * summarize with Bedrock Haiku, store, and return.
 *
 * Tag enrichment: when a bill's `topicTagsSource` is anything other than "llm"
 * (including null for legacy bills), we run `classifyBillFromTitle` to enrich
 * the API anchor with up to 2 additional LoC labels. This runs in parallel
 * with summary generation when both are needed.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { fetchBillText, fetchCosponsors } from "./congress";
import { summarizeBill } from "./summarize";
import { preprocessBillText } from "./bill-text";
import { classifyBillTaxonomy } from "./taxonomy/classify";
import { classifyBillFromTitle } from "./taxonomy/classify-bill-llm";
import { parseTerm } from "./taxonomy";
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

  // Never block a user page-load on AI or Congress.gov full-text fetches.
  // Fire-and-forget background enrichment; the next request will pick up results.
  void generateAndStoreSummary(created.id, created.title, congress, type, number);
  void enrichAndStoreTags(created.id, created.title, apiClassification.topicTags);
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
      // Cache for bill text preview/links to avoid re-hitting the Congress API.
      void prisma.bill.update({
        where: { id: billId },
        data: { fullTextUrl: textUrl },
      });

      const r = await fetch(textUrl);
      if (r.ok) billText = preprocessBillText(await r.text());
    }
    const summary = await summarizeBill(title, billText);
    await prisma.summary.upsert({
      where: { billId },
      update: {
        plainLanguage: summary.plainLanguage,
        keyProvisions: summary.keyProvisions,
        whyItMatters: summary.whyItMatters,
        aiProvider: summary.aiProvider,
        aiModel: summary.aiModel,
      },
      create: {
        billId,
        plainLanguage: summary.plainLanguage,
        keyProvisions: summary.keyProvisions,
        whyItMatters: summary.whyItMatters,
        aiProvider: summary.aiProvider,
        aiModel: summary.aiModel,
      },
    });
  } catch { /* non-fatal */ }
}

/**
 * LLM-enrich a bill's tags. Uses the first existing tag as the API anchor
 * (always preserved), asks Haiku for up to 2 additional LoC labels.
 *
 * Returns the new encoded tag array on success, null on failure (caller can
 * fall back to the existing tags). Always writes `topicTagsSource = "llm"` on
 * success; on failure the row is left untouched and the next view will retry.
 */
async function enrichAndStoreTags(
  billId: string,
  title: string,
  currentTags: string[]
): Promise<string[] | null> {
  try {
    const apiAnchor = parseTerm(currentTags[0] ?? "")?.value ?? null;
    const result = await classifyBillFromTitle({ title, apiAnchor });
    if (result.source !== "llm" || result.topicTags.length === 0) {
      return null;
    }
    await prisma.bill.update({
      where: { id: billId },
      data: { topicTags: result.topicTags, topicTagsSource: "llm" },
    });
    return result.topicTags;
  } catch (e) {
    console.error("[enrichAndStoreTags] error:", e);
    return null;
  }
}
