import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBillImageRecord } from "@/lib/bill-image-categories";
import { fetchAssetUrlsForBills } from "@/lib/image-pool-read";
import {
  getProgressStageRank,
  toProgressStage,
  type ProgressStage,
} from "@/lib/bill-progress";
import {
  isSummaryPlaceholder,
  splitParagraphs,
  splitWhyAndWho,
} from "@/lib/bill-summary";

export const billCardSelect = {
  id: true,
  type: true,
  title: true,
  sponsor: true,
  status: true,
  introducedAt: true,
  latestActionAt: true,
  progressStage: true,
  stageReachedAt: true,
  latestActionText: true,
  topicTags: true,
  imageUrl: true,
  imageAssetId: true,
  viewCount: true,
  summary: {
    select: {
      plainLanguage: true,
      keyProvisions: true,
      whyItMatters: true,
    },
  },
} satisfies Prisma.BillSelect;

export type BillWithSummary = Prisma.BillGetPayload<{
  select: typeof billCardSelect;
}>;

export type HomeBillFeedItem = BillWithSummary & {
  representativeOpinionCount: number;
  homeFeedScore: number;
  homeCompletenessScore: number;
};

export type BillFeedSort = "latest" | "hot";

const HOT_CANDIDATE_LIMIT = 32;
const HOME_CANDIDATE_LIMIT = 160;
const HOME_RECENT_LIMIT = 80;
const HOME_STAGE_LIMIT = 32;
const HOME_SUMMARY_LIMIT = 120;
const HOME_REPRESENTATIVE_LIMIT = 80;
const HOME_PROGRESS_PRIORITY: ProgressStage[] = [
  "enacted",
  "to_president",
  "passed_both",
  "passed_origin",
  "committee",
  "introduced",
];

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
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: billCardSelect,
    });
    return await withResolvedBillImages(bills);
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
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
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

  return await withResolvedBillImages(
    selectedIds
      .map((id) => selectedBills.find((bill) => bill.id === id))
      .filter((bill): bill is BillWithSummary => Boolean(bill))
  );
}

async function withResolvedBillImages<T extends BillWithSummary>(
  bills: T[]
): Promise<T[]> {
  const assetUrlByBillId = await fetchAssetUrlsForBills(
    bills.map((bill) => bill.id)
  );
  return bills.map((bill) => ({
    ...bill,
    imageUrl:
      assetUrlByBillId.get(bill.id) ??
      getBillImageRecord(bill.id, bill.topicTags).imageUrl,
  }));
}

export async function getHomeBillCandidates(): Promise<HomeBillFeedItem[]> {
  const representativeRows = await prisma.repStance.groupBy({
    by: ["billId"],
    _count: {
      billId: true,
    },
    orderBy: {
      _count: {
        billId: "desc",
      },
    },
    take: HOME_REPRESENTATIVE_LIMIT,
  });
  const representativeHeavyBillIds = representativeRows.map((row) => row.billId);

  const stageQueries = HOME_PROGRESS_PRIORITY.map((stage) =>
    prisma.bill.findMany({
      where: {
        progressStage: stage,
      },
      take: HOME_STAGE_LIMIT,
      orderBy: [
        { stageReachedAt: { sort: "desc", nulls: "last" } },
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: billCardSelect,
    })
  );

  const [
    recentBills,
    summaryRichBills,
    representativeHeavyBills,
    ...stageResults
  ] = await Promise.all([
    prisma.bill.findMany({
      take: HOME_RECENT_LIMIT,
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: billCardSelect,
    }),
    prisma.bill.findMany({
      where: {
        summary: {
          isNot: null,
        },
      },
      take: HOME_SUMMARY_LIMIT,
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: billCardSelect,
    }),
    representativeHeavyBillIds.length > 0
      ? prisma.bill.findMany({
          where: {
            id: {
              in: representativeHeavyBillIds,
            },
          },
          select: billCardSelect,
        })
      : Promise.resolve([] as BillWithSummary[]),
    ...stageQueries,
  ]);

  const billsById = new Map<string, BillWithSummary>();
  for (const bill of [
    ...representativeHeavyBills,
    ...summaryRichBills,
    ...stageResults.flat(),
    ...recentBills,
  ]) {
    billsById.set(bill.id, bill);
  }

  const bills = Array.from(billsById.values());
  if (bills.length === 0) {
    return [];
  }

  const representativeOpinionCounts = await getRepresentativeOpinionCounts(
    bills.map((bill) => bill.id)
  );
  const scoredBills = scoreHomeFeedCandidates(
    bills,
    representativeOpinionCounts
  )
    .sort(compareHomeFeedItems)
    .slice(0, HOME_CANDIDATE_LIMIT);

  return await withResolvedBillImages(scoredBills);
}

export function selectHomeFeedBills({
  candidates,
  take,
}: {
  candidates: HomeBillFeedItem[];
  seenBillIds: string[];
  take: number;
}): HomeBillFeedItem[] {
  return candidates.slice(0, take);
}

async function getRepresentativeOpinionCounts(
  billIds: string[]
): Promise<Map<string, number>> {
  const rows = await prisma.repStance.groupBy({
    by: ["billId"],
    where: {
      billId: {
        in: billIds,
      },
    },
    _count: {
      billId: true,
    },
  });

  return new Map(rows.map((row) => [row.billId, row._count.billId]));
}

function scoreHomeFeedCandidates(
  bills: BillWithSummary[],
  representativeOpinionCounts: Map<string, number>
): HomeBillFeedItem[] {
  const timestamps = bills.map((bill) => getHomeFeedTimestamp(bill));
  const oldestTimestamp = Math.min(...timestamps);
  const newestTimestamp = Math.max(...timestamps);
  const maxViewLog = Math.max(
    ...bills.map((bill) => Math.log1p(bill.viewCount))
  );
  const maxOpinionLog = Math.max(
    ...bills.map((bill) =>
      Math.log1p(representativeOpinionCounts.get(bill.id) ?? 0)
    )
  );

  return bills.map((bill) => {
    const representativeOpinionCount =
      representativeOpinionCounts.get(bill.id) ?? 0;

    return {
      ...bill,
      representativeOpinionCount,
      homeCompletenessScore: getHomeCompletenessScore({
        bill,
        representativeOpinionCount,
        maxOpinionLog,
      }),
      homeFeedScore: getHomeFeedScore({
        bill,
        representativeOpinionCount,
        oldestTimestamp,
        newestTimestamp,
        maxViewLog,
        maxOpinionLog,
      }),
    };
  });
}

function getHomeFeedScore({
  bill,
  representativeOpinionCount,
  oldestTimestamp,
  newestTimestamp,
  maxViewLog,
  maxOpinionLog,
}: {
  bill: BillWithSummary;
  representativeOpinionCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  maxViewLog: number;
  maxOpinionLog: number;
}): number {
  const progressScore = getProgressStageRank(bill.progressStage) / 5;
  const actionRange = newestTimestamp - oldestTimestamp;
  const recencyScore =
    actionRange === 0
      ? 1
      : (getHomeFeedTimestamp(bill) - oldestTimestamp) / actionRange;
  const viewsScore =
    maxViewLog === 0 ? 0 : Math.log1p(bill.viewCount) / maxViewLog;
  const opinionScore =
    maxOpinionLog === 0
      ? 0
      : Math.log1p(representativeOpinionCount) / maxOpinionLog;
  const completenessScore = getHomeCompletenessScore({
    bill,
    representativeOpinionCount,
    maxOpinionLog,
  });

  return (
    completenessScore * 0.62 +
    opinionScore * 0.20 +
    progressScore * 0.12 +
    recencyScore * 0.04 +
    viewsScore * 0.02
  );
}

function getHomeCompletenessScore({
  bill,
  representativeOpinionCount,
  maxOpinionLog,
}: {
  bill: BillWithSummary;
  representativeOpinionCount: number;
  maxOpinionLog: number;
}): number {
  const plainLanguage = bill.summary?.plainLanguage ?? "";
  const hasPlainLanguage = !isSummaryPlaceholder(plainLanguage);
  const paragraphScore = hasPlainLanguage
    ? Math.min(splitParagraphs(plainLanguage).length, 3) / 3
    : 0;
  const provisionScore = Math.min(
    bill.summary?.keyProvisions?.length ?? 0,
    5
  ) / 5;
  const whyWho = splitWhyAndWho(bill.summary?.whyItMatters ?? "");
  const whyScore = whyWho.why ? 1 : 0;
  const whoScore = whyWho.who ? 1 : 0;
  const opinionScore =
    maxOpinionLog === 0
      ? 0
      : Math.log1p(representativeOpinionCount) / maxOpinionLog;
  const imageScore = bill.imageAssetId || bill.imageUrl ? 1 : 0;
  const progressScore = toProgressStage(bill.progressStage) ? 1 : 0;
  const actionScore = bill.latestActionText || bill.latestActionAt ? 1 : 0;

  return (
    (hasPlainLanguage ? 0.18 : 0) +
    paragraphScore * 0.12 +
    provisionScore * 0.14 +
    whyScore * 0.14 +
    whoScore * 0.14 +
    opinionScore * 0.18 +
    imageScore * 0.05 +
    progressScore * 0.03 +
    actionScore * 0.02
  );
}

function compareHomeFeedItems(
  left: HomeBillFeedItem,
  right: HomeBillFeedItem
): number {
  const scoreDifference = right.homeFeedScore - left.homeFeedScore;
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return getHomeFeedTimestamp(right) - getHomeFeedTimestamp(left);
}

function getHomeFeedTimestamp(bill: BillWithSummary): number {
  const value =
    bill.stageReachedAt ??
    bill.latestActionAt ??
    bill.introducedAt;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
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
