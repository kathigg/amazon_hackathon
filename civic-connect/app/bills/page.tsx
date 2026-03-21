import { prisma } from "@/lib/prisma";
import IssueCard from "@/components/IssueCard";
import { TOPIC_TAGS } from "@/lib/topics";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  topic?: string;
  page?: string;
}

const PAGE_SIZE = 12;

async function getBills(q?: string, topic?: string, page = 1) {
  const skip = (page - 1) * PAGE_SIZE;
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

  return { bills, total, pages: Math.ceil(total / PAGE_SIZE) };
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Number(searchParams.page ?? 1);
  const { bills, total, pages } = await getBills(
    searchParams.q,
    searchParams.topic,
    page
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-4xl font-bold text-navy mb-2">Active Bills</h1>
        <p className="text-gray-500">{total} bills from the 119th Congress</p>
      </div>

      {/* Search + filters */}
      <form method="GET" className="mb-8 flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Search bills…"
          className="flex-1 px-4 py-3 rounded-full border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
        />
        <button type="submit" className="btn-primary text-sm px-6 py-3">
          Search
        </button>
      </form>

      {/* Topic chips */}
      <div className="flex flex-wrap gap-2 mb-10">
        <Link
          href="/bills"
          className={`tag px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            !searchParams.topic
              ? "bg-navy text-white border-navy"
              : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
          }`}
        >
          All
        </Link>
        {TOPIC_TAGS.map((tag) => (
          <Link
            key={tag}
            href={`/bills?topic=${encodeURIComponent(tag)}${searchParams.q ? `&q=${searchParams.q}` : ""}`}
            className={`tag px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
              searchParams.topic === tag
                ? "bg-navy text-white border-navy"
                : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
            }`}
          >
            {tag}
          </Link>
        ))}
      </div>

      {/* Grid */}
      {bills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bills.map((bill) => (
            <IssueCard
              key={bill.id}
              id={bill.id}
              title={bill.title}
              plainLanguage={bill.summary?.plainLanguage}
              status={bill.status}
              sponsor={bill.sponsor}
              topicTags={bill.topicTags}
              introducedAt={bill.introducedAt}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 text-gray-400">
          <p className="text-lg">No bills found. Try a different search or topic.</p>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/bills?page=${p}${searchParams.q ? `&q=${searchParams.q}` : ""}${searchParams.topic ? `&topic=${searchParams.topic}` : ""}`}
              className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                p === page
                  ? "bg-navy text-white"
                  : "border border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
