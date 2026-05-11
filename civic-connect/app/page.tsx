import Link from "next/link";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import BillLookup from "@/components/BillLookup";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import BillFeedCard from "@/components/BillFeedCard";
import BillIssueVisual from "@/components/BillIssueVisual";
import HomeFeedMemory from "@/components/HomeFeedMemory";
import MilestonePill from "@/components/MilestonePill";
import { getActiveTaxonomy } from "@/lib/taxonomy";
import {
  getHomeBillCandidates,
  selectHomeFeedBills,
  type HomeBillFeedItem,
} from "@/lib/bill-feed";
import { toProgressStage } from "@/lib/bill-progress";
import RelativeTime from "@/components/RelativeTime";
import {
  formatBillDate,
  formatBillShortDate,
} from "@/lib/bill-dates";
import { formatTopicTag } from "@/lib/topics";
import { getSummaryPreview } from "@/lib/bill-summary";
import { withTimeout } from "@/lib/with-timeout";
import {
  HOME_SEEN_BILLS_COOKIE,
  parseSeenBillIds,
} from "@/lib/home-feed-history";

const ACTIVE_TAXONOMY = getActiveTaxonomy();
const HOME_FEED_TIMEOUT_MS = 2_500;
const HOME_FEED_SIZE = 8;

export const dynamic = "force-dynamic";

const getCachedHomeCandidates = unstable_cache(
  async (): Promise<HomeBillFeedItem[]> => {
    return getHomeBillCandidates();
  },
  ["home-feed-candidates-v1"],
  { revalidate: 60 }
);

async function loadHomeFeed(seenBillIds: string[]): Promise<HomeBillFeedItem[]> {
  const candidates = await withTimeout(
    () => getCachedHomeCandidates().catch(() => [] as HomeBillFeedItem[]),
    HOME_FEED_TIMEOUT_MS,
    []
  );

  return selectHomeFeedBills({
    candidates,
    seenBillIds,
    take: HOME_FEED_SIZE,
  });
}

function formatRepresentativeOpinionCount(count: number): string {
  return `${count} representative opinion${count === 1 ? "" : "s"}`;
}

export default async function HomePage() {
  const seenBillIds = parseSeenBillIds(
    cookies().get(HOME_SEEN_BILLS_COOKIE)?.value
  );
  const bills = await loadHomeFeed(seenBillIds);
  const leadBill = bills[0];
  const railBills = bills.slice(1, 4);
  const frontPageBills = bills.slice(0, 6);

  const leadSummary = getSummaryPreview(leadBill?.summary?.plainLanguage);
  const leadStageDate = leadBill?.stageReachedAt ?? leadBill?.latestActionAt;
  const leadStageAbsolute = leadStageDate
    ? formatBillShortDate(leadStageDate)
    : null;
  const leadStageText = leadBill?.latestActionText || leadBill?.status;
  const leadProgressStage = toProgressStage(leadBill?.progressStage);

  return (
    <div className="min-h-screen">
      <HomeFeedMemory billIds={bills.map((bill) => bill.id)} />
      <section className="border-b border-black/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/50 sm:px-6 lg:px-8">
          <span>Front Page</span>
          <span>New mix on every visit</span>
        </div>
      </section>

      {leadBill ? (
        <>
          <section className="border-b border-black/10">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1.5fr)_320px]">
                <article>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-civic-red">
                    Featured Bill
                  </p>
                  <Link href={`/bill/${leadBill.id}`} className="group block">
                    <h1 className="mt-4 font-display text-5xl leading-[0.95] text-navy transition-colors group-hover:text-civic-blue sm:text-6xl">
                      {leadBill.title}
                    </h1>
                    <p className="mt-5 max-w-3xl text-base leading-8 text-navy/72">
                      {leadSummary ??
                        "Read the latest plain-language analysis, party positions, and action steps for this federal bill."}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                      <span>{leadBill.id.toUpperCase()}</span>
                      <span>Introduced: {formatBillDate(leadBill.introducedAt)}</span>
                      {leadBill.latestActionAt && (
                        <span>Latest action: {formatBillDate(leadBill.latestActionAt)}</span>
                      )}
                      {leadBill.representativeOpinionCount > 0 && (
                        <span>{formatRepresentativeOpinionCount(leadBill.representativeOpinionCount)}</span>
                      )}
                      {leadProgressStage && (
                        <MilestonePill
                          stage={leadProgressStage}
                          billType={leadBill.type}
                        />
                      )}
                    </div>
                    {(leadStageText || leadStageAbsolute) && (
                      <div className="mt-4 max-w-3xl border border-black/10 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy/45">
                          Latest update
                          {leadStageAbsolute && (
                            <span className="ml-2 text-navy/70">{leadStageAbsolute}</span>
                          )}
                          <RelativeTime value={leadStageDate ?? null} className="ml-2 text-navy/45" />
                        </div>
                        {leadStageText && (
                          <p className="mt-1 text-sm leading-snug text-navy/80">{leadStageText}</p>
                        )}
                      </div>
                    )}
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

                <aside>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    More from the docket
                  </p>
                  <div className="mt-4 space-y-4">
                    {railBills.map((bill, index) => {
                      const stage = toProgressStage(bill.progressStage);
                      return (
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
                            Latest action:{" "}
                            {formatBillShortDate(
                              bill.latestActionAt ?? bill.introducedAt
                            )}
                          </p>
                          {bill.representativeOpinionCount > 0 && (
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-navy/45">
                              {formatRepresentativeOpinionCount(bill.representativeOpinionCount)}
                            </p>
                          )}
                          {stage && (
                            <div className="mt-2">
                              <MilestonePill stage={stage} billType={bill.type} />
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </aside>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4 border-b border-black/10 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                  Fresh docket
                </p>
                <h2 className="mt-2 font-display text-4xl text-navy">
                  A new mix of bills
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
              {frontPageBills.map((bill) => (
                <BillFeedCard
                  key={bill.id}
                  id={bill.id}
                  billType={bill.type}
                  title={bill.title}
                  plainLanguage={bill.summary?.plainLanguage}
                  status={bill.status}
                  sponsor={bill.sponsor}
                  topicTags={bill.topicTags}
                  imageUrl={bill.imageUrl}
                  introducedAt={bill.introducedAt}
                  latestActionAt={bill.latestActionAt}
                  progressStage={toProgressStage(bill.progressStage)}
                  stageReachedAt={bill.stageReachedAt}
                  latestActionText={bill.latestActionText}
                  viewCount={bill.viewCount}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-5xl text-navy">No bills loaded yet</h1>
          <p className="mt-4 text-base text-navy/70">
            Open the bills desk and fetch a bill to populate the homepage feed.
          </p>
          <Link
            href="/bills"
            className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
          >
            Open Bills Desk
          </Link>
        </section>
      )}

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
                Add your email, pick your policy areas, choose your briefing
                schedule, and tell us which senators or House members to
                surface first.
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
    </div>
  );
}
