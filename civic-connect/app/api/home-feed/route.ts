import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withTimeout } from "@/lib/with-timeout";

const HOME_FEED_TIMEOUT_MS = 2_500;

const getCachedHomeFeed = unstable_cache(
  async () => {
    const [latestBills, hotBills] = await Promise.all([
      prisma.bill.findMany({
        take: 8,
        orderBy: [{ introducedAt: "desc" }, { viewCount: "desc" }],
        select: {
          id: true,
          title: true,
          sponsor: true,
          status: true,
          introducedAt: true,
          topicTags: true,
          imageUrl: true,
          viewCount: true,
          summary: { select: { plainLanguage: true } },
        },
      }),
      prisma.bill.findMany({
        take: 6,
        orderBy: [{ viewCount: "desc" }, { introducedAt: "desc" }],
        select: {
          id: true,
          title: true,
          sponsor: true,
          status: true,
          introducedAt: true,
          topicTags: true,
          imageUrl: true,
          viewCount: true,
          summary: { select: { plainLanguage: true } },
        },
      }),
    ]);

    return { latestBills, hotBills };
  },
  ["home-feed-api-v1"],
  { revalidate: 60 }
);

export async function GET() {
  const data = await withTimeout(
    () => getCachedHomeFeed().catch(() => ({ latestBills: [], hotBills: [] })),
    HOME_FEED_TIMEOUT_MS,
    { latestBills: [], hotBills: [] }
  );

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

