import { prisma } from "./prisma";
import { fetchBillDetail, fetchRecentBills, type CongressBill } from "./congress";
import { classifyBillTaxonomy } from "./taxonomy/classify";
import { isMajorBillAction } from "./breaking-bills";
import { parseCongressDate, parseCongressDateTime } from "./bill-dates";

export const BILL_METADATA_INGEST_LIMIT = 100;

export async function fetchBillsForMetadataIngest(
  congress = 119,
  limit = BILL_METADATA_INGEST_LIMIT
) {
  return fetchRecentBills(congress, limit);
}

export async function upsertBillMetadataFromCongress(bill: CongressBill) {
  const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
  const detail = await fetchBillDetail(bill.congress, bill.type, bill.number);
  const classification = classifyBillTaxonomy(detail, bill.title);
  const sponsor = detail?.sponsor ?? bill.sponsors?.[0]?.fullName ?? "Unknown";
  const status = bill.latestAction?.text ?? "Unknown";
  const candidateIntroducedAt = parseIntroducedDate(
    // Congress list responses no longer include introducedDate reliably.
    // Use the per-bill detail endpoint as the source of truth, then fall back
    // to latest action only when the detail date is unavailable.
    detail?.introducedDate ?? undefined,
    detail?.latestActionDate ?? bill.latestAction?.actionDate
  );
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
    },
  });
  const topicTags = resolveTopicTags(classification.topicTags, existing?.topicTags ?? []);
  const introducedAt = resolveIntroducedAt(
    candidateIntroducedAt,
    existing?.introducedAt ?? null,
    detail?.latestActionDate ?? bill.latestAction?.actionDate
  );
  const breakingAt =
    existing && existing.status !== status && isMajorBillAction(status)
      ? new Date()
      : existing?.breakingAt ?? null;

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
    },
  });

  return {
    billId,
    breakingTriggered: Boolean(
      existing && existing.status !== status && isMajorBillAction(status)
    ),
  };
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

function resolveIntroducedAt(
  candidate: Date,
  existing: Date | null,
  latestActionDate?: string
) {
  if (isLikelyPlaceholderDate(candidate) && existing && !isLikelyPlaceholderDate(existing)) {
    return existing;
  }

  const latestAction = latestActionDate
    ? parseCongressDate(latestActionDate)
    : null;

  if (latestAction && candidate.getTime() > latestAction.getTime() + 24 * 60 * 60 * 1000) {
    return existing ?? latestAction;
  }

  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  if (candidate.getTime() > tomorrow) {
    return existing ?? new Date();
  }

  return candidate;
}

function isLikelyPlaceholderDate(value: Date) {
  return value.getUTCFullYear() <= 2001;
}
