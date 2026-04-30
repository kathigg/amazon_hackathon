import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-tracking";
import { getPersonalizedBills } from "@/lib/recommendations";
import { getBillsBySort } from "@/lib/bill-feed";
import BillFeedCard from "@/components/BillFeedCard";
import BillLookup from "@/components/BillLookup";
import BillIssueVisual from "@/components/BillIssueVisual";
import CongressVisualization from "@/components/CongressVisualization";
import { TOPIC_TAGS } from "@/lib/topics";

export const dynamic = "force-dynamic";

async function getPersonalizedFrontPageBills(userId?: string) {
  if (!userId) {
    return [];
  }

  try {
    const billIds = await getPersonalizedBills(userId, 3);
    const bills = await prisma.bill.findMany({
      where: { id: { in: billIds } },
      include: { summary: true },
    });

    return billIds
      .map((id) => bills.find((bill) => bill.id === id))
      .filter((bill) => bill !== undefined);
  } catch {
    return [];
  }
}

async function getBillsForVisualization() {
  try {
    const bills = await prisma.bill.findMany({
      take: 100,
      orderBy: { introducedAt: "desc" },
      select: { id: true, title: true, status: true },
    });

    return bills.map((bill) => ({
      ...bill,
      stage: classifyBillStage(bill.status),
    }));
  } catch {
    return [];
  }
}

function classifyBillStage(status: string): "introduced" | "committee" | "house_passed" | "senate" | "signed" | "vetoed" {
  const lower = status.toLowerCase();
  if (lower.includes("became law") || lower.includes("signed")) return "signed";
  if (lower.includes("vetoed")) return "vetoed";
  if (lower.includes("passed senate") || lower.includes("senate")) return "senate";
  if (lower.includes("passed house")) return "house_passed";
  if (lower.includes("committee")) return "committee";
  return "introduced";
}

export default async function HomePage() {
  const currentUser = await getCurrentUser().catch(() => null);
  const [hotBills, latestBills, personalizedBills, visualizationBills] = await Promise.all([
    getBillsBySort({ sort: "hot", take: 6 }),
    getBillsBySort({ sort: "latest", take: 5 }),
    getPersonalizedFrontPageBills(currentUser?.id),
    getBillsForVisualization(),
  ]);

  const leadBill = hotBills[0];
  const secondaryBills = hotBills.slice(1, 3);
  const feedBills = hotBills.slice(0, 4);

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
                      Hot Bill
                    </p>
                    <Link href={`/bill/${leadBill.id}`} className="group block">
                      <h1 className="mt-4 font-display text-5xl leading-[0.95] text-navy transition-colors group-hover:text-civic-blue sm:text-6xl">
                        {leadBill.title}
                      </h1>
                      <p className="mt-5 max-w-3xl text-base leading-8 text-navy/72">
                        {leadBill.summary?.plainLanguage ??
                          "Read the latest plain-language analysis, party positions, and action steps for this federal bill."}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                        <span>{leadBill.id.toUpperCase()}</span>
                        <span>{formatFullDate(leadBill.introducedAt)}</span>
                        <span>{leadBill.viewCount.toLocaleString()} readers</span>
                      </div>
                      <div className="mt-8 overflow-hidden border border-black/10 bg-white">
                        <BillIssueVisual
                          billId={leadBill.id}
                          title={leadBill.title}
                          imageThumbnailUrl={leadBill.imageThumbnailUrl}
                          imageUrl={leadBill.imageUrl}
                          imageTitle={leadBill.imageTitle}
                          imageCreator={leadBill.imageCreator}
                          imageLicense={leadBill.imageLicense}
                          imageLicenseVersion={leadBill.imageLicenseVersion}
                          className="h-72 w-full"
                          preferFull
                        />
                      </div>
                    </Link>
                  </article>

                  <aside className="border-t border-black/10 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                      More in Hot
                    </p>
                    <div className="mt-4 space-y-6">
                      {secondaryBills.map((bill) => (
                        <Link
                          key={bill.id}
                          href={`/bill/${bill.id}`}
                          className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                            {bill.topicTags[0] ?? "General"} · {bill.viewCount.toLocaleString()} readers
                          </p>
                          <h2 className="mt-2 font-display text-3xl leading-tight text-navy">
                            {bill.title}
                          </h2>
                          <p className="mt-2 text-sm leading-7 text-navy/65 line-clamp-3">
                            {bill.summary?.plainLanguage ?? "Open the bill page for the summary, context, and next steps."}
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
                          {index + 1 < 10 ? `0${index + 1}` : index + 1} · {formatCompactDate(bill.introducedAt)}
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
                    Drop in a bill ID like <span className="font-semibold">hr-1-119</span> or a keyword and CivicConnect will take you straight to the filing.
                  </p>
                  <div className="mt-6">
                    <BillLookup />
                  </div>
                </div>

                <div className="border border-black/10 bg-white p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    {personalizedBills.length > 0
                      ? "For You"
                      : currentUser?.email
                        ? "Tune Your Desk"
                        : "Quick Account"}
                  </p>
                  {personalizedBills.length > 0 ? (
                    <>
                      <h2 className="mt-3 font-display text-3xl text-navy">
                        A shortlist tuned to your reading
                      </h2>
                      <div className="mt-5 space-y-4">
                        {personalizedBills.map((bill) => (
                          <Link
                            key={bill.id}
                            href={`/bill/${bill.id}`}
                            className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                              {bill.topicTags[0] ?? "General"}
                            </p>
                            <h3 className="mt-2 font-display text-2xl leading-tight text-navy">
                              {bill.title}
                            </h3>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : currentUser?.email ? (
                    <>
                      <h2 className="mt-3 font-display text-3xl text-navy">
                        Fine-tune what lands in For You
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-navy/68">
                        Update your saved issues to give the recommendation feed a
                        cleaner starting point before your reading history takes
                        over.
                      </p>
                      <Link
                        href="/account"
                        className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
                      >
                        Manage Account
                      </Link>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-3 font-display text-3xl text-navy">
                        Create a quick account
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-navy/68">
                        Add your email, pick at least one policy area, and
                        CivicConnect will keep a saved desk ready for you on
                        future visits.
                      </p>
                      <Link
                        href="/account"
                        className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
                      >
                        Start Your Desk
                      </Link>
                    </>
                  )}
                </div>

                <div className="border border-black/10 bg-white p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                    Browse the Desks
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-navy">
                    Track a policy beat
                  </h2>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {TOPIC_TAGS.map((topic) => (
                      <Link
                        key={topic}
                        href={`/bills?topic=${encodeURIComponent(topic)}`}
                        className="border border-black/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/70 transition-colors hover:border-navy hover:text-navy"
                      >
                        {topic}
                      </Link>
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
                  Most Read
                </p>
                <h2 className="mt-2 font-display text-4xl text-navy">Bills driving attention now</h2>
              </div>
              <Link
                href="/bills?sort=hot"
                className="shrink-0 border border-black/10 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy"
              >
                View All Hot Bills
              </Link>
            </div>

            <div className="mt-2 border-t border-black/10">
              {feedBills.map((bill) => (
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
                  imageThumbnailUrl={bill.imageThumbnailUrl}
                  imageUrl={bill.imageUrl}
                  imageTitle={bill.imageTitle}
                  imageCreator={bill.imageCreator}
                  imageLicense={bill.imageLicense}
                  imageLicenseVersion={bill.imageLicenseVersion}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-5xl text-navy">No bills loaded yet</h1>
          <p className="mt-4 text-base text-navy/70">
            Use the bill lookup to fetch one on demand, or run the ingestion script to build the front page.
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
              <h2 className="mt-2 font-display text-4xl text-navy">Bills in Motion</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-navy/65">
              A live view of how recently loaded bills are moving through the legislative process.
            </p>
          </div>
          <CongressVisualization bills={visualizationBills} />
        </div>
      </section>
    </div>
  );
}

function formatCompactDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatFullDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
