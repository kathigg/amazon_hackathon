import { prisma } from "./prisma";
import { parseTerm } from "./taxonomy";
import { cosine } from "./embeddings";

const SUBJECT_PREFIX = "loc-subject/";
const AREA_PREFIX = "loc-area/";

export function areaCategoryKey(policyAreaTerm: string): string {
  return `${AREA_PREFIX}${policyAreaTerm}`;
}

export function subjectCategoryKey(rawSubject: string): string {
  return `${SUBJECT_PREFIX}${rawSubject.trim()}`;
}

export function buildCategoryKeysForBill(
  topicTags: readonly string[],
  legislativeSubjects: readonly string[]
): string[] {
  const keys: string[] = [];

  for (const subject of legislativeSubjects) {
    const trimmed = subject?.trim();
    if (trimmed) {
      keys.push(subjectCategoryKey(trimmed));
    }
  }

  for (const tag of topicTags) {
    const parsed = parseTerm(tag);
    if (parsed) {
      keys.push(areaCategoryKey(parsed.value));
    }
  }

  return Array.from(new Set(keys));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export interface AssetSelection {
  id: string;
  cdnUrl: string;
  categoryKey: string;
}

// Type-asserted accessors. After `prisma db push` adds the BillImageAsset model
// and Bill.imageAssetId, these become typed via the regenerated client.
// Today they degrade gracefully: an unmigrated client has no `billImageAsset`
// delegate, so every read returns [] and every write is a no-op. That keeps the
// existing render path (Wikimedia hotlinks via getBillImageRecord) working
// until curation has been run.
interface AssetCandidate extends AssetSelection {
  embedding: number[];
}

type BillImageAssetDelegate = {
  findMany: (args: {
    where: { categoryKey: string; retiredAt: null };
    select: {
      id: true;
      cdnUrl: true;
      categoryKey: true;
      embedding: true;
    };
    orderBy: { id: "asc" };
  }) => Promise<AssetCandidate[]>;
};

type BillUpdateDelegate = {
  update: (args: {
    where: { id: string };
    data: { imageAssetId: string };
  }) => Promise<unknown>;
};

type BillReaderDelegate = {
  findUnique: (args: {
    where: { id: string };
    select: { topicEmbedding: true };
  }) => Promise<{ topicEmbedding: number[] } | null>;
};

function getBillImageAssetDelegate(): BillImageAssetDelegate | null {
  return (
    (prisma as unknown as { billImageAsset?: BillImageAssetDelegate })
      .billImageAsset ?? null
  );
}

function getBillUpdater(): BillUpdateDelegate {
  return prisma.bill as unknown as BillUpdateDelegate;
}

function getBillReader(): BillReaderDelegate {
  return prisma.bill as unknown as BillReaderDelegate;
}

async function fetchBillTopicEmbedding(billId: string): Promise<number[]> {
  try {
    const bill = await getBillReader().findUnique({
      where: { id: billId },
      select: { topicEmbedding: true },
    });
    return bill?.topicEmbedding ?? [];
  } catch {
    // Schema may not yet have topicEmbedding; degrade to empty.
    return [];
  }
}

function pickDeterministic(
  billId: string,
  key: string,
  pool: AssetCandidate[]
): AssetSelection {
  const index = hashString(`${billId}::${key}`) % pool.length;
  return toSelection(pool[index]);
}

export interface AssetScore {
  id: string;
  cdnUrl: string;
  categoryKey: string;
  score: number;
}

export function scoreAssetsForBill(
  billEmbedding: readonly number[],
  pool: readonly { id: string; cdnUrl: string; categoryKey: string; embedding: number[] }[]
): AssetScore[] {
  const scored: AssetScore[] = [];
  for (const candidate of pool) {
    if (candidate.embedding.length === 0) continue;
    scored.push({
      id: candidate.id,
      cdnUrl: candidate.cdnUrl,
      categoryKey: candidate.categoryKey,
      score: cosine(billEmbedding as number[], candidate.embedding),
    });
  }
  return scored;
}

function pickByCosine(
  billEmbedding: number[],
  pool: AssetCandidate[]
): AssetSelection | null {
  let best: AssetScore | null = null;
  for (const scored of scoreAssetsForBill(billEmbedding, pool)) {
    if (!best || scored.score > best.score) best = scored;
  }
  if (!best) return null;
  return { id: best.id, cdnUrl: best.cdnUrl, categoryKey: best.categoryKey };
}

function toSelection(candidate: AssetCandidate): AssetSelection {
  return {
    id: candidate.id,
    cdnUrl: candidate.cdnUrl,
    categoryKey: candidate.categoryKey,
  };
}

/**
 * Pick an asset for a bill, trying each provided category key in order.
 *
 * When the bill has a topicEmbedding AND at least one candidate in the cell
 * has an embedding, picks argmax(cosine). Otherwise falls back to a stable
 * deterministic hash. Both code paths are preserved so a partial-embedding
 * state still works (e.g. before the one-time embed pass has run).
 *
 * Returns null if none of the keys has any live asset.
 */
export async function selectAssetForBill(
  billId: string,
  categoryKeys: readonly string[]
): Promise<AssetSelection | null> {
  const delegate = getBillImageAssetDelegate();
  if (!delegate) return null;

  const billEmbedding = await fetchBillTopicEmbedding(billId);
  const useCosine = billEmbedding.length > 0;

  for (const key of categoryKeys) {
    const pool = await delegate.findMany({
      where: { categoryKey: key, retiredAt: null },
      select: { id: true, cdnUrl: true, categoryKey: true, embedding: true },
      orderBy: { id: "asc" },
    });

    if (pool.length === 0) {
      continue;
    }

    if (useCosine) {
      const cosinePick = pickByCosine(billEmbedding, pool);
      if (cosinePick) return cosinePick;
    }

    return pickDeterministic(billId, key, pool);
  }

  return null;
}

export async function assignBillImageAsset(
  billId: string,
  topicTags: readonly string[],
  legislativeSubjects: readonly string[]
): Promise<AssetSelection | null> {
  const keys = buildCategoryKeysForBill(topicTags, legislativeSubjects);
  if (keys.length === 0) {
    return null;
  }

  const selection = await selectAssetForBill(billId, keys);
  if (!selection) {
    return null;
  }

  try {
    await getBillUpdater().update({
      where: { id: billId },
      data: { imageAssetId: selection.id },
    });
  } catch (error) {
    // If the schema hasn't been migrated yet, Bill.imageAssetId doesn't exist
    // and Prisma rejects the unknown field. Don't fail the surrounding flow.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("imageAssetId")) {
      throw error;
    }
    return null;
  }

  return selection;
}
