import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBillImageRecord } from "@/lib/bill-image-categories";
import { fetchAssetUrlsForBills } from "@/lib/image-pool-read";
import {
  getProgressStageRank,
  toProgressStage,
  type ProgressStage,
} from "@/lib/bill-progress";

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

export type HomeBillFeedItem = BillWithSummary & {
  representativeOpinionCount: number;
  homeFeedScore: number;
};

export type BillFeedSort = "latest" | "hot";

const HOT_CANDIDATE_LIMIT = 32;
const HOME_CANDIDATE_LIMIT = 160;
const HOME_RECENT_LIMIT = 80;
const HOME_STAGE_LIMIT = 32;
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

  const [recentBills, ...stageResults] = await Promise.all([
    prisma.bill.findMany({
      take: HOME_RECENT_LIMIT,
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: billCardSelect,
    }),
    ...stageQueries,
  ]);

  const billsById = new Map<string, BillWithSummary>();
  for (const bill of [...stageResults.flat(), ...recentBills]) {
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
  seenBillIds,
  take,
}: {
  candidates: HomeBillFeedItem[];
  seenBillIds: string[];
  take: number;
}): HomeBillFeedItem[] {
  const seenBillIdSet = new Set(seenBillIds.map((id) => id.toLowerCase()));
  const unseenCandidates = candidates.filter(
    (bill) => !seenBillIdSet.has(bill.id.toLowerCase())
  );
  const pool = unseenCandidates.length > 0 ? unseenCandidates : candidates;

  return selectMixedProgressFeed(pool, take);
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

  return (
    progressScore * 0.52 +
    opinionScore * 0.24 +
    recencyScore * 0.18 +
    viewsScore * 0.06
  );
}

function selectMixedProgressFeed(
  candidates: HomeBillFeedItem[],
  take: number
): HomeBillFeedItem[] {
  const buckets = new Map<ProgressStage, HomeBillFeedItem[]>(
    HOME_PROGRESS_PRIORITY.map((stage) => [stage, []])
  );

  for (const bill of candidates) {
    const stage = toProgressStage(bill.progressStage) ?? "introduced";
    buckets.get(stage)?.push(bill);
  }

  for (const bucket of Array.from(buckets.values())) {
    bucket.sort(compareHomeFeedItems);
  }

  const selected: HomeBillFeedItem[] = [];
  const selectedIds = new Set<string>();
  const mixedStageOrder = [
    ...HOME_PROGRESS_PRIORITY,
    ...HOME_PROGRESS_PRIORITY,
  ];

  for (const stage of mixedStageOrder) {
    if (selected.length >= take) {
      break;
    }

    const bill = takeRandomStrongCandidate(buckets.get(stage) ?? []);
    if (bill && !selectedIds.has(bill.id)) {
      selected.push(bill);
      selectedIds.add(bill.id);
    }
  }

  if (selected.length < take) {
    const remainingCandidates = candidates
      .filter((bill) => !selectedIds.has(bill.id))
      .map((bill) => ({
        bill,
        score: bill.homeFeedScore + Math.random() * 0.08,
      }))
      .sort((left, right) => right.score - left.score)
      .map(({ bill }) => bill);

    for (const bill of remainingCandidates) {
      if (selected.length >= take) {
        break;
      }
      selected.push(bill);
      selectedIds.add(bill.id);
    }
  }

  return selected;
}

function takeRandomStrongCandidate(
  bucket: HomeBillFeedItem[]
): HomeBillFeedItem | null {
  if (bucket.length === 0) {
    return null;
  }

  const windowSize = Math.min(bucket.length, 6);
  const selectedIndex = Math.floor(Math.random() * windowSize);
  const [bill] = bucket.splice(selectedIndex, 1);

  return bill ?? null;
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
  return (
    bill.stageReachedAt ??
    bill.latestActionAt ??
    bill.introducedAt
  ).getTime();
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
