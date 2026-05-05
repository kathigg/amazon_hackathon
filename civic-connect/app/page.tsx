import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getBillsBySort } from "@/lib/bill-feed";
import BillFeedCard from "@/components/BillFeedCard";
import BillLookup from "@/components/BillLookup";
import BillIssueVisual from "@/components/BillIssueVisual";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import CongressVisualization from "@/components/CongressVisualization";
import { getSummaryPreview } from "@/lib/bill-summary";
import { formatTopicTag } from "@/lib/topics";
import { getActiveTaxonomy } from "@/lib/taxonomy";
import { formatBillDate, formatBillShortDate } from "@/lib/bill-dates";
import { withTimeout } from "@/lib/with-timeout";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

export const revalidate = 300;
const HOME_QUERY_TIMEOUT_MS = 2_500;

const getCachedHotBills = unstable_cache(
  () => getBillsBySort({ sort: "hot", take: 6 }),
  ["home-hot-bills"],
  { revalidate: 300 }
);

const getCachedLatestBills = unstable_cache(
  () => getBillsBySort({ sort: "latest", take: 8 }),
  ["home-latest-bills"],
  { revalidate: 300 }
);

const getCachedVisualizationBills = unstable_cache(
  async () => {
    const bills = await prisma.bill.findMany({
      take: 40,
      orderBy: { introducedAt: "desc" },
      select: { id: true, title: true, status: true },
    });

    return bills.map((bill) => ({
      ...bill,
      stage: classifyBillStage(bill.status),
    }));
  },
  ["home-visualization-bills"],
  { revalidate: 300 }
);

async function getBillsForVisualization() {
  return withTimeout(
    () => getCachedVisualizationBills().catch(() => []),
    HOME_QUERY_TIMEOUT_MS,
    []
  );
}

function classifyBillStage(
  status: string
):
  | "introduced"
  | "committee"
  | "passed_one"
  | "passed_both"
  | "president"
  | "enacted"
  | "vetoed" {
  const lower = status.toLowerCase();

  if (lower.includes("vetoed")) return "vetoed";

  if (
    lower.includes("became law") ||
    lower.includes("signed by president") ||
    lower.includes("signed into law") ||
    lower.includes("enacted")
  ) {
    return "enacted";
  }

  if (
    lower.includes("passed house") &&
    lower.includes("passed senate")
  ) {
    return "passed_both";
  }

  if (
    lower.includes("presented to president") ||
    lower.includes("sent to president")
  ) {
    return "president";
  }

  if (
    lower.includes("conference") ||
    lower.includes("resolving differences")
  ) {
    return "passed_both";
  }

  if (
    lower.includes("passed senate") ||
    lower.includes("passed house") ||
    lower.includes("agreed to in senate") ||
    lower.includes("agreed to in house") ||
    lower.includes("received in the senate") ||
    lower.includes("received in the house")
  ) {
    return "passed_one";
  }

  if (
    lower.includes("committee") ||
    lower.includes("reported") ||
    lower.includes("placed on") ||
    lower.includes("ordered to be reported") ||
    lower.includes("referred to")
  ) {
    return "committee";
  }

  return "introduced";
}

export default async function HomePage() {
  const hotBills = await withTimeout(
    () => getCachedHotBills().catch(() => []),
    HOME_QUERY_TIMEOUT_MS,
    []
  );
  const latestBills = await withTimeout(
    () => getCachedLatestBills().catch(() => []),
    HOME_QUERY_TIMEOUT_MS,
    []
  );
  const visualizationBills = await getBillsForVisualization();

  const leadBill = latestBills[0];
  const secondaryBills = hotBills.slice(0, 2);
  const feedBills = latestBills.slice(0, 6);
  const leadSummary = getSummaryPreview(leadBill?.summary?.plainLanguage);

  return (
    <div className="min-h-screen">
      <section className="border-b border-black/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/50 sm:px-6 lg:px-8">
          <span>Front Page</span>
          <span>Updated throughout the day</span>
        </div>
      </section>

      {leadBill ? (
        <>
          <section className="border-b border-black/10">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1.5fr)_320px]">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <article>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-civic-red">
                      Latest Bill
                    </p>
                    <Link href={`/bill/${leadBill.id}`} className="group block">
                      <h1 className="mt-4 font-display text-5xl leading-[0.95] text-navy transition-colors group-hover:text-civic-blue sm:text-6xl">
                        {leadBill.title}
                      </h1>
                      <p className="mt-5 max-w-3xl text-base leading-8 text-navy/72">
                        {leadSummary ??
                          "Read the latest plain-language analysis, party positions, and action steps for this federal bill."}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                        <span>{leadBill.id.toUpperCase()}</span>
                        <span>{formatBillDate(leadBill.introducedAt)}</span>
                        <span>
                          Opened by {leadBill.viewCount.toLocaleString()} readers
                        </span>
                      </div>
                      <div className="mt-8 overflow-hidden border border-black/10 bg-white">
                        <BillIssueVisual
                          billId={leadBill.id}
                          title={leadBill.title}
                          topicLabel={
                            leadBill.topicTags[0]
                              ? formatTopicTag(leadBill.topicTags[0])
                              : "General"
                          }
                          topicTags={leadBill.topicTags}
                          imageUrl={leadBill.imageUrl}
                          className="h-72 w-full"
                          preferFull
                        />
                      </div>
                    </Link>
                  </article>

                  <aside className="border-t border-black/10 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                      Trending Now
                    </p>
                    <div className="mt-4 space-y-6">
                      {secondaryBills.map((bill) => (
                        <Link
                          key={bill.id}
                          href={`/bill/${bill.id}`}
                          className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                            {(bill.topicTags[0]
                              ? formatTopicTag(bill.topicTags[0])
                              : "General")}{" "}
                            · {bill.viewCount.toLocaleString()} readers
                          </p>
                          <h2 className="mt-2 font-display text-3xl leading-tight text-navy">
                            {bill.title}
                          </h2>
                          <p className="mt-2 line-clamp-3 text-sm leading-7 text-navy/65">
                            {getSummaryPreview(bill.summary?.plainLanguage) ??
                              "Open the bill page for the summary, context, and next steps."}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </aside>
                </div>

                <aside className="border-t border-black/10 pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Latest From Congress
                  </p>
                  <div className="mt-4 space-y-4">
                    {latestBills.map((bill, index) => (
                      <Link
                        key={bill.id}
                        href={`/bill/${bill.id}`}
                        className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                          {index + 1 < 10 ? `0${index + 1}` : index + 1} ·{" "}
                          {formatBillShortDate(bill.introducedAt)}
                        </p>
                        <h2 className="mt-2 font-display text-2xl leading-tight text-navy">
                          {bill.title}
                        </h2>
                      </Link>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          </section>

          <section className="border-b border-black/10">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-3">
                <div className="border border-black/10 bg-white p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Bill Lookup
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-navy">
                    Search a bill by name or number
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-navy/68">
                    Drop in a bill ID like{" "}
                    <span className="font-semibold">hr-1-119</span> or a keyword
                    and CivicConnect will take you straight to the filing.
                  </p>
                  <div className="mt-6">
                    <ClientErrorBoundary>
                      <BillLookup />
                    </ClientErrorBoundary>
                  </div>
                </div>

                <div className="border border-black/10 bg-white p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Reader Profile
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-navy">
                    Build your own congressional briefing
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-navy/68">
                    Add your email, pick your policy areas, choose your
                    briefing schedule, and tell us which senators or House
                    members to surface first.
                  </p>
                  <Link
                    href="/account"
                    className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
                  >
                    Start Your Desk
                  </Link>
                </div>

                <div className="border border-black/10 bg-white p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Browse the Desks
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-navy">
                    Track a policy beat
                  </h2>
                  <div className="mt-5 space-y-4">
                    {ACTIVE_TAXONOMY.groups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-navy/40">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.terms.map((topic) => (
                            <Link
                              key={topic}
                              href={`/bills?topic=${encodeURIComponent(topic)}`}
                              className="border border-black/10 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-navy/70 transition-colors hover:border-navy hover:text-navy"
                            >
                              {topic}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4 border-b border-black/10 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                  Latest
                </p>
                <h2 className="mt-2 font-display text-4xl text-navy">
                  Newly introduced bills
                </h2>
              </div>
              <Link
                href="/bills"
                className="shrink-0 border border-black/10 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy"
              >
                View All Bills
              </Link>
            </div>

            <div className="mt-2 border-t border-black/10">
              <ClientErrorBoundary>
                {feedBills.map((bill) => (
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
                  />
                ))}
              </ClientErrorBoundary>
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-5xl text-navy">No bills loaded yet</h1>
          <p className="mt-4 text-base text-navy/70">
            Use the bill lookup to fetch one on demand, or run the ingestion
            script to build the front page.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <BillLookup />
          </div>
        </section>
      )}

      <section className="border-t border-black/10 bg-white/65">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                Process Tracker
              </p>
              <h2 className="mt-2 font-display text-4xl text-navy">
                Bills in Motion
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-navy/65">
              A live view of how recently loaded bills are moving through the
              legislative process.
            </p>
          </div>
          <ClientErrorBoundary>
            <CongressVisualization bills={visualizationBills} />
          </ClientErrorBoundary>
        </div>
      </section>
    </div>
  );
}
