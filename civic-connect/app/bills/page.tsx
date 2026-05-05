import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import BillFeedCard from "@/components/BillFeedCard";
import { BillFeedSort, billCardSelect, getBillsBySort } from "@/lib/bill-feed";
import {
  filterPredicateForTopic,
  getActiveTaxonomy,
} from "@/lib/taxonomy";
import { formatBillShortDate } from "@/lib/bill-dates";
import { formatTopicTag } from "@/lib/topics";
import { withTimeout } from "@/lib/with-timeout";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

export const revalidate = 60;

interface SearchParams {
  q?: string;
  topic?: string;
  page?: string;
  sort?: string;
  personalized?: string;
}

const PAGE_SIZE = 12;
const BILLS_QUERY_TIMEOUT_MS = 2_500;

async function getBills({
  q,
  topic,
  page = 1,
  sort,
}: {
  q?: string;
  topic?: string;
  page?: number;
  sort: BillFeedSort;
}) {
  const where = {
    ...(q && {
      title: { contains: q, mode: "insensitive" as const },
    }),
    ...(topic && {
      topicTags: { hasSome: filterPredicateForTopic(topic) },
    }),
  };

  const { bills, total, pages } = await withTimeout(
    () =>
      getCachedFeedPage(q?.trim() || "", topic?.trim() || "", page, sort).catch(
        () => ({ bills: [], total: 0, pages: 1 })
      ),
    BILLS_QUERY_TIMEOUT_MS,
    { bills: [], total: 0, pages: 1 }
  );

  return {
    bills,
    total,
    pages,
  };
}

const getCachedFeedPage = unstable_cache(
  async (q: string, topic: string, page: number, sort: BillFeedSort) => {
    const where = {
      ...(q && {
        title: { contains: q, mode: "insensitive" as const },
      }),
      ...(topic && {
        topicTags: { hasSome: filterPredicateForTopic(topic) },
      }),
    };
    const skip = (page - 1) * PAGE_SIZE;
    const [total, bills] = await Promise.all([
      prisma.bill.count({ where }),
      getBillsBySort({
        where,
        sort,
        take: PAGE_SIZE,
        skip,
      }),
    ]);

    return {
      bills,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  },
  ["bills-feed-page"],
  { revalidate: 300 }
);

export default async function BillsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Number(searchParams.page ?? 1);
  const sort = normalizeSort(searchParams.sort);

  const [{ bills, total, pages }, railBills] =
    await Promise.all([
      getBills({
        q: searchParams.q,
        topic: searchParams.topic,
        page,
        sort,
      }),
      withTimeout(
        () =>
          getBillsBySort({
            sort: sort === "hot" ? "latest" : "hot",
            take: 4,
          }).catch(() => []),
        BILLS_QUERY_TIMEOUT_MS,
        []
      ),
    ]);

  const title = getFeedTitle({
    q: searchParams.q,
    topic: searchParams.topic,
    sort,
    personalized: false,
  });

  const description = getFeedDescription({
    q: searchParams.q,
    topic: searchParams.topic,
    sort,
    personalized: false,
    total,
  });

  return (
    <div className="min-h-screen">
      <section className="border-b border-black/10">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-navy/50">
                {searchParams.topic
                  ? `${searchParams.topic} Desk`
                  : sort === "hot"
                    ? "Hot Desk"
                    : "Bills Desk"}
              </p>
              <h1 className="mt-2 font-display text-5xl leading-none text-navy sm:text-6xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-navy/70 sm:text-base">
                {description}
              </p>

              <form method="GET" className="mt-8 flex flex-col gap-3 sm:flex-row">
                {searchParams.topic && (
                  <input type="hidden" name="topic" value={searchParams.topic} />
                )}
                {searchParams.sort && (
                  <input type="hidden" name="sort" value={searchParams.sort} />
                )}
                {searchParams.personalized === "true" &&
                  !searchParams.q &&
                  !searchParams.topic && (
                    <input type="hidden" name="personalized" value="true" />
                  )}
                <input
                  type="text"
                  name="q"
                  defaultValue={searchParams.q}
                  placeholder="Search bill titles"
                  className="w-full border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
                />
                <button
                  type="submit"
                  className="border border-navy bg-navy px-6 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-navy/90"
                >
                  Search
                </button>
              </form>
            </div>

            <aside className="border-t border-black/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    What Our Readers Open Most
                  </p>
                  <p className="mt-3 text-sm leading-7 text-navy/70">
                    The `Hot` feed blends two signals: what our readers are
                    opening most often and what Congress introduced most
                    recently.
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Desks
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ACTIVE_TAXONOMY.prioritizedTerms.map((topic) => (
                      <Link
                        key={topic}
                        href={`/bills?topic=${encodeURIComponent(topic)}`}
                        className="border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/70 transition-colors hover:border-navy hover:text-navy"
                      >
                        {topic}
                      </Link>
                    ))}
                  </div>
                  <details className="group mt-3">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45 hover:text-navy">
                      Browse all desks{" "}
                      <span className="inline-block transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      {ACTIVE_TAXONOMY.groups.map((group) => (
                        <div key={group.label}>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-navy/40">
                            {group.label}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.terms
                              .filter(
                                (topic) =>
                                  !ACTIVE_TAXONOMY.prioritizedTerms.includes(
                                    topic
                                  )
                              )
                              .map((topic) => (
                                <Link
                                  key={topic}
                                  href={`/bills?topic=${encodeURIComponent(topic)}`}
                                  className="border border-black/10 bg-white px-2 py-1 text-[10px] font-medium tracking-wide text-navy/60 transition-colors hover:border-navy hover:text-navy"
                                >
                                  {topic}
                                </Link>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {bills.length > 0 ? (
              <div className="space-y-2 border-t border-black/10">
                {bills.map((bill) => (
                  <BillFeedCard
                    key={bill.id}
                    id={bill.id}
                    title={bill.title}
                    plainLanguage={bill.summary?.plainLanguage}
                    status={bill.status}
                    sponsor={bill.sponsor}
                    topicTags={bill.topicTags}
                    imageUrl={bill.imageUrl}
                    introducedAt={bill.introducedAt}
                    viewCount={bill.viewCount}
                    isPersonalized={false}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-black/10 bg-white px-8 py-16 text-center">
                <p className="font-display text-3xl text-navy">No bills found</p>
                <p className="mt-3 text-sm text-navy/60">
                  Try a different search or return to the latest desk.
                </p>
                <Link
                  href="/bills"
                  className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
                >
                  Browse Latest
                </Link>
              </div>
            )}

            {pages > 1 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {Array.from({ length: Math.min(pages, 6) }, (_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <Link
                      key={pageNumber}
                      href={buildBillsHref({
                        page: String(pageNumber),
                        q: searchParams.q,
                        topic: searchParams.topic,
                        sort: searchParams.sort,
                        personalized: searchParams.personalized,
                      })}
                      className={`inline-flex h-10 min-w-10 items-center justify-center border px-4 text-xs font-semibold uppercase tracking-[0.22em] transition-colors ${
                        pageNumber === page
                          ? "border-navy bg-navy text-white"
                          : "border-black/10 bg-white text-navy hover:border-navy"
                      }`}
                    >
                      {pageNumber}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="border-t border-black/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              {sort === "hot"
                ? "Fresh From Congress"
                : "Opened Most By Our Readers"}
            </p>
            <div className="mt-4 space-y-4">
              {railBills.map((bill, index) => (
                <Link
                  key={bill.id}
                  href={`/bill/${bill.id}`}
                  className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                    {index + 1 < 10 ? `0${index + 1}` : index + 1} ·{" "}
                    {bill.topicTags[0]
                      ? formatTopicTag(bill.topicTags[0])
                      : "General"}
                  </p>
                  <h2 className="mt-2 font-display text-2xl leading-tight text-navy">
                    {bill.title}
                  </h2>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-navy/45">
                    {formatBillShortDate(bill.introducedAt)} ·{" "}
                    {bill.viewCount.toLocaleString()} readers
                  </p>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function normalizeSort(sort?: string): BillFeedSort {
  return sort === "hot" ? "hot" : "latest";
}

function getFeedTitle({
  q,
  topic,
  sort,
  personalized,
}: {
  q?: string;
  topic?: string;
  sort: BillFeedSort;
  personalized: boolean;
}) {
  if (q) {
    return "Search Results";
  }

  if (personalized) {
    return "Bills For You";
  }

  if (topic) {
    return `${topic} Bills`;
  }

  return sort === "hot" ? "Hot Bills" : "Latest Bills";
}

function getFeedDescription({
  q,
  topic,
  sort,
  personalized,
  total,
}: {
  q?: string;
  topic?: string;
  sort: BillFeedSort;
  personalized: boolean;
  total: number;
}) {
  if (q) {
    return `Matching bill headlines across the 119th Congress. ${total} result${
      total === 1 ? "" : "s"
    } found.`;
  }

  if (personalized) {
    return "A briefing assembled around the subjects you follow and the bills our readers are returning to most.";
  }

  if (topic) {
    return `${total} bill${total === 1 ? "" : "s"} in the ${topic} desk, ordered for current relevance and readability.`;
  }

  if (sort === "hot") {
    return "The bills our readers are opening most often right now, weighted with recency so the feed stays current.";
  }

  return `${total} bill${total === 1 ? "" : "s"} from the 119th Congress, led by the newest arrivals from Capitol Hill.`;
}

function buildBillsHref(params: SearchParams): string {
  const nextParams = new URLSearchParams();

  if (params.page && params.page !== "1") {
    nextParams.set("page", params.page);
  }
  if (params.q) {
    nextParams.set("q", params.q);
  }
  if (params.topic) {
    nextParams.set("topic", params.topic);
  }
  if (params.sort && params.sort !== "latest") {
    nextParams.set("sort", params.sort);
  }
  if (params.personalized === "true" && !params.q && !params.topic) {
    nextParams.set("personalized", "true");
  }

  const query = nextParams.toString();
  return query ? `/bills?${query}` : "/bills";
}
