import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/user-tracking";
import { getPersonalizedBills } from "@/lib/recommendations";
import BillFeedCard from "@/components/BillFeedCard";
import { TOPIC_TAGS } from "@/lib/topics";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  topic?: string;
  page?: string;
  personalized?: string;
}

const PAGE_SIZE = 12;

async function getBills(
  q?: string,
  topic?: string,
  page = 1,
  userId?: string,
  personalized = true
) {
  const skip = (page - 1) * PAGE_SIZE;

  // If search or topic filter, use standard query
  if (q || topic || !personalized) {
    const where = {
      ...(q && {
        title: { contains: q, mode: "insensitive" as const },
      }),
      ...(topic && {
        topicTags: { has: topic },
      }),
    };

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        take: PAGE_SIZE,
        skip,
        orderBy: { introducedAt: "desc" },
        include: { summary: true },
      }),
      prisma.bill.count({ where }),
    ]);

    return { bills, total, pages: Math.ceil(total / PAGE_SIZE), personalized: false };
  }

  // Personalized feed
  if (userId) {
    const billIds = await getPersonalizedBills(userId, PAGE_SIZE);
    const bills = await prisma.bill.findMany({
      where: { id: { in: billIds } },
      include: { summary: true },
    });

    // Maintain order from recommendation algorithm
    const orderedBills = billIds
      .map((id) => bills.find((b) => b.id === id))
      .filter((b) => b !== undefined);

    const total = await prisma.bill.count();
    return { bills: orderedBills, total, pages: 1, personalized: true };
  }

  // Default: recent bills
  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      take: PAGE_SIZE,
      skip,
      orderBy: { introducedAt: "desc" },
      include: { summary: true },
    }),
    prisma.bill.count(),
  ]);

  return { bills, total, pages: Math.ceil(total / PAGE_SIZE), personalized: false };
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Number(searchParams.page ?? 1);
  const userId = await getUserId().catch(() => undefined);
  const personalized = searchParams.personalized !== "false";

  const { bills, total, pages, personalized: isPersonalized } = await getBills(
    searchParams.q,
    searchParams.topic,
    page,
    userId,
    personalized
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-navy">
                {isPersonalized ? "Your Feed" : "All Bills"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {isPersonalized
                  ? "Bills matched to your interests"
                  : `${total} bills from the 119th Congress`}
              </p>
            </div>
            {userId && !searchParams.q && !searchParams.topic && (
              <Link
                href={`/bills?personalized=${!personalized}`}
                className="text-sm bg-white px-4 py-2 rounded-full border border-gray-200 hover:border-civic-blue hover:text-civic-blue transition-colors"
              >
                {personalized ? "Show All" : "For You"}
              </Link>
            )}
          </div>

          {/* Search */}
          <form method="GET" className="mb-4">
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q}
              placeholder="Search bills..."
              className="w-full px-4 py-3 rounded-full border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm bg-white"
            />
          </form>

          {/* Topic filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <Link
              href="/bills"
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !searchParams.topic
                  ? "bg-navy text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-navy"
              }`}
            >
              All
            </Link>
            {TOPIC_TAGS.map((tag) => (
              <Link
                key={tag}
                href={`/bills?topic=${encodeURIComponent(tag)}${searchParams.q ? `&q=${searchParams.q}` : ""}`}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  searchParams.topic === tag
                    ? "bg-navy text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-navy"
                }`}
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>

        {/* Feed */}
        {bills.length > 0 ? (
          <div className="space-y-4">
            {bills.map((bill) => (
              <BillFeedCard
                key={bill.id}
                id={bill.id}
                title={bill.title}
                plainLanguage={bill.summary?.plainLanguage}
                status={bill.status}
                sponsor={bill.sponsor}
                topicTags={bill.topicTags}
                introducedAt={bill.introducedAt}
                viewCount={bill.viewCount}
                isPersonalized={isPersonalized && !searchParams.q && !searchParams.topic}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-2xl">
            <p className="text-xl text-gray-400 mb-2">No bills found</p>
            <p className="text-sm text-gray-400">Try a different search or topic</p>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <Link
                  key={pageNum}
                  href={`/bills?page=${pageNum}${searchParams.q ? `&q=${searchParams.q}` : ""}${searchParams.topic ? `&topic=${searchParams.topic}` : ""}`}
                  className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    pageNum === page
                      ? "bg-navy text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-navy"
                  }`}
                >
                  {pageNum}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
