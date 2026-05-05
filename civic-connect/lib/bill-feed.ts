import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const billWithSummaryInclude = {
  summary: true,
} satisfies Prisma.BillInclude;

export type BillWithSummary = Prisma.BillGetPayload<{
  include: typeof billWithSummaryInclude;
}>;

export type BillFeedSort = "latest" | "hot";

const HOT_CANDIDATE_LIMIT = 60;

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
    return prisma.bill.findMany({
      where,
      take,
      skip,
      orderBy: [{ introducedAt: "desc" }, { viewCount: "desc" }],
      include: billWithSummaryInclude,
    });
  }

  const [popularBills, recentBills] = await Promise.all([
    prisma.bill.findMany({
      where,
      take: HOT_CANDIDATE_LIMIT,
      orderBy: [{ viewCount: "desc" }, { introducedAt: "desc" }],
      include: billWithSummaryInclude,
    }),
    prisma.bill.findMany({
      where,
      take: HOT_CANDIDATE_LIMIT,
      orderBy: [{ introducedAt: "desc" }, { viewCount: "desc" }],
      include: billWithSummaryInclude,
    }),
  ]);

  const bills = Array.from(
    new Map(
      [...popularBills, ...recentBills].map((bill) => [bill.id, bill])
    ).values()
  );

  return rankBillsByHotScore(bills).slice(skip, skip + take);
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
