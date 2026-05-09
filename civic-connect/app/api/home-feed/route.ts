import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withTimeout } from "@/lib/with-timeout";
import { getBillImageRecord } from "@/lib/bill-image-categories";

const HOME_FEED_TIMEOUT_MS = 2_500;

export const dynamic = "force-dynamic";

const getCachedHomeFeed = unstable_cache(
  async () => {
    const [latestBills, recentBills] = await Promise.all([
      prisma.bill.findMany({
        take: 8,
        orderBy: [
          { latestActionAt: { sort: "desc", nulls: "last" } },
          { introducedAt: "desc" },
          { id: "desc" },
        ],
        select: {
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
          summary: { select: { plainLanguage: true } },
        },
      }),
      prisma.bill.findMany({
        take: 6,
        skip: 1,
        orderBy: [
          { latestActionAt: { sort: "desc", nulls: "last" } },
          { introducedAt: "desc" },
          { id: "desc" },
        ],
        select: {
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
          summary: { select: { plainLanguage: true } },
        },
      }),
    ]);

    return {
      latestBills: withResolvedBillImages(latestBills),
      recentBills: withResolvedBillImages(recentBills),
    };
  },
  ["home-feed-api-v2"],
  { revalidate: 60 }
);

export async function GET() {
  const data = await withTimeout(
    () =>
      getCachedHomeFeed().catch(() => ({ latestBills: [], recentBills: [] })),
    HOME_FEED_TIMEOUT_MS,
    { latestBills: [], recentBills: [] }
  );

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

function withResolvedBillImages<
  T extends { id: string; topicTags: string[]; imageUrl: string | null },
>(bills: T[]): T[] {
  return bills.map((bill) => ({
    ...bill,
    imageUrl: getBillImageRecord(bill.id, bill.topicTags).imageUrl,
  }));
}
