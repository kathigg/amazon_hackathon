import { prisma } from "./prisma";
import { fetchBillDetail, fetchRecentBills, type CongressBill } from "./congress";
import { inferTopics } from "./topics";
import { isMajorBillAction } from "./breaking-bills";
import { fetchBestOpenverseBillImage, getNoImageAttemptMetadata } from "./openverse";

export const BILL_METADATA_INGEST_LIMIT = 100;

export async function fetchBillsForMetadataIngest(
  congress = 119,
  limit = BILL_METADATA_INGEST_LIMIT
) {
  return fetchRecentBills(congress, limit);
}

export async function upsertBillMetadataFromCongress(bill: CongressBill) {
  const billId = `${bill.type.toLowerCase()}-${bill.number}-${bill.congress}`;
  const topicTags = inferTopics(bill.title);
  const detail = await fetchBillDetail(bill.congress, bill.type, bill.number);
  const sponsor = detail?.sponsor ?? bill.sponsors?.[0]?.fullName ?? "Unknown";
  const status = bill.latestAction?.text ?? "Unknown";
  const introducedAt = parseIntroducedDate(bill.introducedDate);
  const existing = await prisma.bill.findUnique({
    where: { id: billId },
    select: { status: true, breakingAt: true, title: true, imageFetchedAt: true },
  });
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
      topicTags,
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
      topicTags,
      fullTextUrl: null,
      breakingAt: null,
    },
  });

  if (!existing?.imageFetchedAt || existing.title !== bill.title) {
    await refreshBillImage(billId, bill.title, topicTags);
  }

  return {
    billId,
    breakingTriggered: Boolean(
      existing && existing.status !== status && isMajorBillAction(status)
    ),
  };
}

function parseIntroducedDate(introducedDate?: string) {
  if (!introducedDate) {
    return new Date();
  }

  const parsed = new Date(introducedDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function refreshBillImage(
  billId: string,
  title: string,
  topicTags: string[]
) {
  try {
    const image = await fetchBestOpenverseBillImage({ title, topicTags });
    await prisma.bill.update({
      where: { id: billId },
      data: image ?? getNoImageAttemptMetadata(topicTags[0]?.toLowerCase() ?? null),
    });
  } catch {}
}
