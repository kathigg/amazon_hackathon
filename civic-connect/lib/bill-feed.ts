import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBillImageRecord } from "@/lib/bill-image-categories";

export const billCardSelect = {
  id: true,
  title: true,
  sponsor: true,
  status: true,
  introducedAt: true,
  latestActionAt: true,
  topicTags: true,
  imageUrl: true,
  viewCount: true,
  summary: {
    select: {
      plainLanguage: true,
    },
  },
} satisfies Prisma.BillSelect;

export type BillWithSummary = Prisma.BillGetPayload<{
  select: typeof billCardSelect;
}>;

export type BillFeedSort = "latest" | "hot";

const HOT_CANDIDATE_LIMIT = 32;

export async function getBillsBySort({
  where,
  sort = "latest",
  take,
  skip = 0,
}: {
  where?: Prisma.BillWhereInput;
  sort?: BillFeedSort;
  take: number;
  skip?: number;
}): Promise<BillWithSummary[]> {
  if (sort === "latest") {
    const bills = await prisma.bill.findMany({
      where,
      take,
      skip,
      orderBy: [{ introducedAt: "desc" }, { viewCount: "desc" }],
      select: billCardSelect,
    });
    return withResolvedBillImages(bills);
  }

  const candidateSelect = {
    id: true,
    introducedAt: true,
    viewCount: true,
  } satisfies Prisma.BillSelect;

  const [popularBills, recentBills] = await Promise.all([
    prisma.bill.findMany({
      where,
      take: HOT_CANDIDATE_LIMIT,
      orderBy: [{ viewCount: "desc" }, { introducedAt: "desc" }],
      select: candidateSelect,
    }),
    prisma.bill.findMany({
      where,
      take: HOT_CANDIDATE_LIMIT,
      orderBy: [{ introducedAt: "desc" }, { viewCount: "desc" }],
      select: candidateSelect,
    }),
  ]);

  const candidates = Array.from(
    new Map(
      [...popularBills, ...recentBills].map((bill) => [bill.id, bill])
    ).values()
  );

  const selectedIds = rankBillsByHotScore(candidates)
    .slice(skip, skip + take)
    .map((bill) => bill.id);

  if (selectedIds.length === 0) {
    return [];
  }

  const selectedBills = await prisma.bill.findMany({
    where: {
      id: {
        in: selectedIds,
      },
    },
    select: billCardSelect,
  });

  return withResolvedBillImages(selectedIds
    .map((id) => selectedBills.find((bill) => bill.id === id))
    .filter((bill): bill is BillWithSummary => Boolean(bill)));
}

function withResolvedBillImages(bills: BillWithSummary[]): BillWithSummary[] {
  return bills.map((bill) => ({
    ...bill,
    imageUrl: getBillImageRecord(bill.id, bill.topicTags).imageUrl,
  }));
}

export function rankBillsByHotScore<T extends { introducedAt: Date; viewCount: number }>(
  bills: T[]
): T[] {
  if (bills.length <= 1) {
    return bills;
  }

  const timestamps = bills.map((bill) => bill.introducedAt.getTime());
  const oldestTimestamp = Math.min(...timestamps);
  const newestTimestamp = Math.max(...timestamps);
  const maxViewLog = Math.max(...bills.map((bill) => Math.log1p(bill.viewCount)));

  return [...bills].sort((left, right) => {
    const scoreDifference =
      getHotScore(right, oldestTimestamp, newestTimestamp, maxViewLog) -
      getHotScore(left, oldestTimestamp, newestTimestamp, maxViewLog);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    if (right.viewCount !== left.viewCount) {
      return right.viewCount - left.viewCount;
    }

    return right.introducedAt.getTime() - left.introducedAt.getTime();
  });
}

function getHotScore(
  bill: { introducedAt: Date; viewCount: number },
  oldestTimestamp: number,
  newestTimestamp: number,
  maxViewLog: number
): number {
  const recencyRange = newestTimestamp - oldestTimestamp;
  const recencyScore =
    recencyRange === 0
      ? 1
      : (bill.introducedAt.getTime() - oldestTimestamp) / recencyRange;

  const viewsScore =
    maxViewLog === 0 ? 0 : Math.log1p(bill.viewCount) / maxViewLog;

  return viewsScore * 0.62 + recencyScore * 0.38;
}
