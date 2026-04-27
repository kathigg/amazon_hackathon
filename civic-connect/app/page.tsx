import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/user-tracking";
import { getPersonalizedBills } from "@/lib/recommendations";
import IssueCard from "@/components/IssueCard";
import BillLookup from "@/components/BillLookup";
import { TOPIC_TAGS } from "@/lib/topics";

export const dynamic = "force-dynamic";

async function getFeaturedBills(userId?: string) {
  try {
    // If user exists, show personalized bills
    if (userId) {
      const billIds = await getPersonalizedBills(userId, 6);
      const bills = await prisma.bill.findMany({
        where: { id: { in: billIds } },
        include: { summary: true },
      });
      // Maintain order
      return billIds
        .map((id) => bills.find((b) => b.id === id))
        .filter((b) => b !== undefined);
    }

    // Otherwise show trending
    return await prisma.bill.findMany({
      take: 6,
      orderBy: { viewCount: "desc" },
      include: { summary: true },
    });
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const userId = await getUserId().catch(() => undefined);
  const bills = await getFeaturedBills(userId);
  const isPersonalized = !!userId;

  return (
    <>
      {/* Hero */}
      <section className="bg-navy text-white py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[url('/stars.svg')] bg-repeat" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 text-sm mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live bill data from the 119th Congress
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6">
            Know Your Laws.
            <br />
            <span className="text-civic-gold">Act on Them.</span>
          </h1>
          <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            CivicConnect translates complex U.S. federal legislation into plain English — so you can understand what Congress is doing and take action.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/bills" className="btn-primary text-base px-8 py-4">
              Explore Active Bills
            </Link>
            <Link href="/about" className="btn-outline border-white text-white hover:bg-white hover:text-navy text-base px-8 py-4">
              How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-cream">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-navy text-center mb-4">
            Three ways to engage
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            From understanding a bill to contacting your representative — we cover the full civic journey.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Issue Cards",
                desc: "AI-generated plain-language summaries of active federal bills. No legalese.",
                color: "bg-blue-50 border-blue-200",
              },
              {
                title: "Stance Cards",
                desc: "See how Democrats and Republicans have voted and positioned themselves on each bill.",
                color: "bg-red-50 border-red-200",
              },
              {
                title: "Action Cards",
                desc: "Connect with advocacy organizations and contact your representatives directly.",
                color: "bg-amber-50 border-amber-200",
              },
            ].map((item) => (
              <div key={item.title} className={`rounded-card border-2 p-8 ${item.color}`}>
                <h3 className="font-bold text-navy text-xl mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bill lookup */}
      <section className="py-12 px-4 bg-navy/5 border-y border-navy/10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl font-bold text-navy mb-2">Look up any bill</h2>
          <p className="text-gray-500 text-sm mb-6">
            Enter a bill ID (e.g. <code className="bg-gray-100 px-1 rounded">hr-1-119</code>) or search by keyword below. If we don't have it yet, we'll summarize it on the spot.
          </p>
          <BillLookup />
        </div>
      </section>

      {/* Topic filters */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-navy mb-8">Browse by Topic</h2>
          <div className="flex flex-wrap gap-3">
            {TOPIC_TAGS.map((tag) => (
              <Link
                key={tag}
                href={`/bills?topic=${encodeURIComponent(tag)}`}
                className="px-5 py-2 rounded-full border-2 border-navy/20 text-navy text-sm font-medium hover:bg-navy hover:text-white transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured bills */}
      <section className="py-8 px-4 pb-24">
        <div className="max-w-7xl mx-auto">
          {bills.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="font-display text-3xl font-bold text-navy">
                    {isPersonalized ? "Bills For You" : "Trending Bills"}
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">
                    {isPersonalized
                      ? "Personalized based on your interests"
                      : "Most viewed by CivicConnect users"}
                  </p>
                </div>
                <Link href="/bills" className="text-civic-blue font-medium text-sm hover:underline">
                  View all →
                </Link>
              </div>
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
            </>
          ) : (
            <div className="text-center py-16">
              <h2 className="font-display text-2xl font-bold text-navy mb-2">No bills loaded yet</h2>
              <p className="text-gray-500 mb-6">Use the lookup above to find any bill, or run the ingestion script to load bills in bulk.</p>
              <Link href="/bills" className="btn-primary inline-block">Browse Bills</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
