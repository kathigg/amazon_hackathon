/**
 * Fetch a bill from DB if cached, otherwise pull from Congress.gov,
 * summarize with Bedrock Haiku, store, and return.
 *
 * Tag enrichment: when a bill's `topicTagsSource` is anything other than "llm"
 * (including null for legacy bills), we run `classifyBillFromTitle` to enrich
 * the API anchor with up to 2 additional LoC labels. This runs in parallel
 * with summary generation when both are needed.
 */
import { prisma } from "./prisma";
import { fetchBillText, fetchCosponsors } from "./congress";
import { summarizeBill } from "./summarize";
import { preprocessBillText } from "./bill-text";
import { classifyBillTaxonomy } from "./taxonomy/classify";
import { classifyBillFromTitle } from "./taxonomy/classify-bill-llm";
import { parseTerm } from "./taxonomy";
import { fetchBillVotes } from "./votes";
import { fetchBestOpenverseBillImage, getNoImageAttemptMetadata } from "./openverse";
import { parseIntroducedDate } from "./bill-ingestion";

const BASE = "https://api.congress.gov/v3";
function getCongressApiKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

export async function getBillOrFetch(billId: string) {
  const existing = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true, stances: true },
  });

  if (existing) {
    // Run summary + tag enrichment in parallel when both are needed.
    const needsSummary = !existing.summary;
    const needsEnrich = existing.topicTagsSource !== "llm";

    let enrichedTags: string[] | null = null;
    if (needsSummary || needsEnrich) {
      const [, enrichResult] = await Promise.all([
        needsSummary
          ? generateAndStoreSummary(
              existing.id,
              existing.title,
              existing.congress,
              existing.type,
              existing.number
            )
          : Promise.resolve(null),
        needsEnrich
          ? enrichAndStoreTags(existing.id, existing.title, existing.topicTags)
          : Promise.resolve(null),
      ]);
      if (enrichResult) enrichedTags = enrichResult;
    }

    // Fetch stances on-demand if missing (bill was ingested before stance data was available)
    if (existing.stances.length === 0) {
      await fetchAndStoreStances(billId, existing.congress, existing.type, existing.number);
    }

    // Retry image fetch if it failed before and we now have a summary
    const tagsForImage = enrichedTags ?? existing.topicTags;
    if (!existing.imageFetchedAt) {
      const updatedBill = needsSummary
        ? await prisma.bill.findUnique({
            where: { id: billId },
            select: { summary: true },
          })
        : { summary: existing.summary };
      if (updatedBill?.summary) {
        await fetchAndStoreOpenverseImage(
          existing.id,
          existing.title,
          tagsForImage,
          updatedBill.summary.plainLanguage
        );
      }
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

  // Summary + tag enrichment in parallel.
  const [, enrichedTags] = await Promise.all([
    generateAndStoreSummary(created.id, created.title, congress, type, number),
    enrichAndStoreTags(created.id, created.title, apiClassification.topicTags),
  ]);

  // Get the freshly written summary (parallel call landed it).
  const billWithSummary = await prisma.bill.findUnique({
    where: { id: created.id },
    include: { summary: true },
  });

  // Image fetch uses the (possibly enriched) tag set + summary.
  await fetchAndStoreOpenverseImage(
    created.id,
    created.title,
    enrichedTags ?? created.topicTags,
    billWithSummary?.summary?.plainLanguage
  );

  // Fetch vote stances and cosponsors
  await fetchAndStoreStances(created.id, congress, type, number);

  return prisma.bill.findUnique({
    where: { id: created.id },
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

async function fetchAndStoreOpenverseImage(
  billId: string,
  title: string,
  topicTags: string[],
  summary?: string
) {
  try {
    const image = await fetchBestOpenverseBillImage({ title, topicTags, summary });
    await prisma.bill.update({
      where: { id: billId },
      data: image ?? getNoImageAttemptMetadata(parseTerm(topicTags[0])?.value.toLowerCase() ?? null),
    });
  } catch {}
}
