import { prisma } from "./prisma";
import {
  fetchBillDetail,
  fetchBillSummaries,
  fetchBillActions,
  fetchRecentBills,
  type CongressBill,
} from "./congress";
import { classifyBillTaxonomy } from "./taxonomy/classify";
import { isMajorBillAction } from "./breaking-bills";
import { parseCongressDate, parseCongressDateTime } from "./bill-dates";
import { classifyBillProgress, type ProgressStage } from "./bill-progress";
import { assignBillImageAsset } from "./image-pool";
import { embedText } from "./embeddings";

export const BILL_METADATA_INGEST_LIMIT = 100;

export async function fetchBillsForMetadataIngest(
  congress = 119,
  limit = BILL_METADATA_INGEST_LIMIT
) {
  return fetchRecentBills(congress, limit);
}

export interface UpsertResult {
  billId: string;
  breakingTriggered: boolean;
  skipped?: "missing_introduced_date";
}

export async function upsertBillMetadataFromCongress(
  bill: CongressBill
): Promise<UpsertResult> {
  const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
  const [detail, summaries, actions] = await Promise.all([
    fetchBillDetail(bill.congress, bill.type, bill.number),
    fetchBillSummaries(bill.congress, bill.type, bill.number),
    fetchBillActions(bill.congress, bill.type, bill.number),
  ]);

  const classification = await classifyBillTaxonomy(detail, bill.title);
  const sponsor = detail?.sponsor ?? bill.sponsors?.[0]?.fullName ?? "Unknown";
  const status = bill.latestAction?.text ?? "Unknown";

  const latestActionAt = parseCongressDateTime(
    detail?.latestActionDate ?? bill.latestAction?.actionDate,
    detail?.latestActionTime ?? bill.latestAction?.actionTime,
    detail?.latestActionDate ?? bill.latestAction?.actionDate
  );

  const existing = await prisma.bill.findUnique({
    where: { id: billId },
    select: {
      status: true,
      breakingAt: true,
      introducedAt: true,
      topicTags: true,
      progressStage: true,
    },
  });

  const introducedAt = resolveIntroducedAt(detail?.introducedDate, existing?.introducedAt ?? null);
  if (!introducedAt) {
    console.warn(
      `[ingest] Skipping ${billId}: no introducedDate from Congress.gov and no existing row`
    );
    return { billId, breakingTriggered: false, skipped: "missing_introduced_date" };
  }

  const originChamber: "House" | "Senate" =
    detail?.originChamber ?? inferOriginChamberFromType(bill.type);
  const progress = classifyBillProgress({
    billType: bill.type,
    originChamber,
    laws: detail?.laws ?? [],
    summaries,
    actions,
  });

  const topicTags = resolveTopicTags(classification.topicTags, existing?.topicTags ?? []);

  const stageChanged =
    existing?.progressStage !== undefined &&
    existing.progressStage !== null &&
    existing.progressStage !== progress.stage;
  const statusChanged = existing && existing.status !== status;
  const breakingAt =
    (stageChanged || (statusChanged && isMajorBillAction(status)))
      ? new Date()
      : existing?.breakingAt ?? null;

  const lastSyncedAt = parseSyncedAt(detail?.updateDate);

  await prisma.bill.upsert({
    where: { id: billId },
    update: {
      title: bill.title,
      sponsor,
      status,
      introducedAt,
      latestActionAt,
      topicTags,
      topicTagsSource:
        topicTags.length === classification.topicTags.length && topicTags.length > 0
          ? classification.source
          : existing?.topicTags?.length
            ? "preserved"
            : classification.source,
      breakingAt,
      progressStage: progress.stage,
      stageReachedAt: progress.stageReachedAt,
      latestActionText: progress.latestActionText,
      lastSyncedAt,
    },
    create: {
      id: billId,
      congress: bill.congress,
      number: bill.number,
      type: bill.type,
      title: bill.title,
      sponsor,
      status,
      introducedAt,
      latestActionAt,
      topicTags,
      topicTagsSource: topicTags.length > 0 ? classification.source : "none",
      fullTextUrl: null,
      breakingAt: null,
      progressStage: progress.stage,
      stageReachedAt: progress.stageReachedAt,
      latestActionText: progress.latestActionText,
      lastSyncedAt,
    },
  });

  await persistLegislativeSubjects(billId, detail?.subjects ?? []);
  await ensureTopicEmbedding(billId, bill.title, detail?.subjects ?? []);
  await assignBillImageAsset(billId, topicTags, detail?.subjects ?? []);

  return {
    billId,
    breakingTriggered: stageChanged || (Boolean(statusChanged) && isMajorBillAction(status)),
  };
}

/**
 * Compute and persist Bill.topicEmbedding if missing. Fail-soft: a Bedrock
 * outage or a pre-migration schema both leave the row without an embedding,
 * which makes selectAssetForBill fall back to deterministic hash selection.
 */
async function ensureTopicEmbedding(
  billId: string,
  title: string,
  subjects: string[]
): Promise<void> {
  const reader = prisma.bill as unknown as {
    findUnique: (args: {
      where: { id: string };
      select: { topicEmbedding: true };
    }) => Promise<{ topicEmbedding: number[] } | null>;
  };
  let existing: { topicEmbedding: number[] } | null;
  try {
    existing = await reader.findUnique({
      where: { id: billId },
      select: { topicEmbedding: true },
    });
  } catch {
    return; // pre-migration column missing
  }
  if (existing && existing.topicEmbedding.length > 0) return;

  const corpus = [title, ...subjects].filter(Boolean).join(" ").trim();
  if (!corpus) return;

  let embedding: number[];
  try {
    embedding = await embedText(corpus);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ingest] embed skip ${billId}: ${message}`);
    return;
  }

  try {
    await (
      prisma.bill.update as unknown as (args: {
        where: { id: string };
        data: { topicEmbedding: number[]; topicEmbeddedAt: Date };
      }) => Promise<unknown>
    )({
      where: { id: billId },
      data: { topicEmbedding: embedding, topicEmbeddedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/topicEmbedding|topicEmbeddedAt/i.test(message)) throw error;
  }
}

/**
 * Write Bill.legislativeSubjects via a separate update so the call works even
 * before the schema migration adds the column. After `prisma db push` the
 * type-assertion becomes a no-op and the column is populated normally.
 */
async function persistLegislativeSubjects(
  billId: string,
  subjects: string[]
): Promise<void> {
  if (subjects.length === 0) return;
  try {
    await (
      prisma.bill.update as unknown as (args: {
        where: { id: string };
        data: { legislativeSubjects: string[] };
      }) => Promise<unknown>
    )({
      where: { id: billId },
      data: { legislativeSubjects: subjects },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/legislativeSubjects/i.test(message)) {
      throw error;
    }
    // Pre-migration: column doesn't exist yet; ignore.
  }
}

function resolveIntroducedAt(
  rawIntroducedDate: string | null | undefined,
  existing: Date | null
): Date | null {
  if (rawIntroducedDate) {
    const parsed = parseCongressDate(rawIntroducedDate);
    if (parsed.getUTCFullYear() > 2001) {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      if (parsed.getTime() <= tomorrow) {
        return parsed;
      }
    }
  }
  if (existing && existing.getUTCFullYear() > 2001) {
    return existing;
  }
  return null;
}

function inferOriginChamberFromType(billType: string): "House" | "Senate" {
  const t = billType.toUpperCase();
  if (t.startsWith("S")) return "Senate";
  return "House";
}

function parseSyncedAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseIntroducedDate(
  introducedDate?: string,
  fallbackActionDate?: string
) {
  return parseCongressDate(introducedDate, fallbackActionDate);
}

function resolveTopicTags(
  candidateTopicTags: string[],
  existingTopicTags: string[]
) {
  if (candidateTopicTags.length > 0) {
    return candidateTopicTags;
  }

  if (existingTopicTags.length > 0) {
    return existingTopicTags;
  }

  return [];
}

export type { ProgressStage };
