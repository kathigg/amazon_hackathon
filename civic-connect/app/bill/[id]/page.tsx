import { prisma } from "@/lib/prisma";
import { getBillOrFetch } from "@/lib/getBillOrFetch";
import StanceCard from "@/components/StanceCard";
import ActionCard from "@/components/ActionCard";
import FeedbackButton from "@/components/FeedbackButton";
import SummaryLoading from "@/components/SummaryLoading";
import BillProgressFlow from "@/components/BillProgressFlow";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

async function getBill(id: string) {
  return getBillOrFetch(id);
}

async function getRelatedOrgsAndEvents(topicTags: string[]) {
  const orgs = await prisma.organization.findMany({
    where: { topicTags: { hasSome: topicTags } },
    take: 3,
  });
  const orgIds = orgs.map((o: { id: string }) => o.id);
  const events = await prisma.event.findMany({
    where: {
      orgId: { in: orgIds },
      date: { gte: new Date() },
    },
    take: 3,
    orderBy: { date: "asc" },
    include: { org: { select: { name: true } } },
  });
  return { orgs, events };
}

function StatusIcon({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower.includes("became law") || lower.includes("signed"))
    return <CheckCircle className="text-green-500" size={20} />;
  if (lower.includes("passed"))
    return <CheckCircle className="text-blue-500" size={20} />;
  if (lower.includes("introduced"))
    return <Clock className="text-amber-500" size={20} />;
  return <AlertCircle className="text-gray-400" size={20} />;
}

export default async function BillDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const bill = await getBill(params.id);
  if (!bill) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-navy mb-3">Bill Not Found</h1>
        <p className="text-gray-500 mb-4">
          We couldn't find or fetch <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">{params.id}</code>.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Make sure the bill ID is in the format <code className="bg-gray-100 px-1 rounded">hr-1-119</code> (type-number-congress), and that your Congress.gov API key is valid.
        </p>
        <Link href="/" className="btn-primary inline-block">Back to Home</Link>
      </div>
    );
  }

  const { orgs, events } = await getRelatedOrgsAndEvents(bill.topicTags);
  const demStance = bill.stances.find((s: { party: string }) => s.party === "Democrat");
  const repStance = bill.stances.find((s: { party: string }) => s.party === "Republican");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back */}
      <Link
        href="/bills"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Bills
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          {/* Issue Card — full detail */}
          <div className="card p-8">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {bill.topicTags.map((tag: string) => (
                <Link
                  key={tag}
                  href={`/bills?topic=${encodeURIComponent(tag)}`}
                  className="tag bg-blue-50 text-civic-blue hover:bg-civic-blue hover:text-white transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>

            {/* Bill type badge */}
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {bill.type} {bill.number} · {bill.congress}th Congress
            </span>

            <h1 className="font-display text-2xl md:text-3xl font-bold text-navy mt-2 mb-6 leading-tight">
              {bill.title}
            </h1>

            {/* Status */}
            <div className="flex items-center gap-2 mb-6 p-3 bg-gray-50 rounded-xl">
              <StatusIcon status={bill.status} />
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Current Status</p>
                <p className="text-sm text-navy font-medium">{bill.status}</p>
              </div>
            </div>

            {/* Sponsor + date */}
            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Sponsor</p>
                <p className="font-medium text-navy">{bill.sponsor}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Introduced</p>
                <p className="font-medium text-navy">
                  {new Date(bill.introducedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Legislative Progress Flowchart */}
          <BillProgressFlow status={bill.status} />

          {/* AI Summary card */}
          <div className="card p-8">
            {/* AI Summary */}
            {bill.summary ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-navy">Plain-Language Summary</h2>
                    <span className="tag bg-amber-100 text-amber-700 text-xs">AI Generated</span>
                  </div>
                  <FeedbackButton billId={bill.id} />
                </div>
                <p className="text-gray-700 leading-relaxed mb-6">{bill.summary.plainLanguage}</p>

                {bill.summary.keyProvisions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-navy mb-3">Key Provisions</h3>
                    <ul className="space-y-2">
                      {bill.summary.keyProvisions.map((p: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                          <span className="w-5 h-5 rounded-full bg-civic-blue text-white text-xs flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(bill.summary.whyItMatters || bill.summary.plainLanguage) && (
                  <div className="mt-6 p-4 bg-civic-gold/10 border border-civic-gold/30 rounded-xl">
                    <h3 className="font-semibold text-navy mb-2 flex items-center gap-2">
                      <span className="text-civic-gold">★</span> Why This Matters
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {bill.summary.whyItMatters || bill.summary.plainLanguage}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <SummaryLoading />
            )}
          </div>

          {/* Stance Cards */}
          {(demStance || repStance) && (
            <div id="stances">
              <h2 className="font-display text-2xl font-bold text-navy mb-4">Party Positions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {demStance && (
                  <StanceCard
                    party="Democrat"
                    position={demStance.position}
                    voteYes={demStance.voteYes}
                    voteNo={demStance.voteNo}
                    source={demStance.source}
                  />
                )}
                {repStance && (
                  <StanceCard
                    party="Republican"
                    position={repStance.position}
                    voteYes={repStance.voteYes}
                    voteNo={repStance.voteNo}
                    source={repStance.source}
                  />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Vote data sourced from Congress.gov. Positions reflect voting records only — not editorial opinion.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar — Action Card */}
        <div id="action" className="lg:col-span-1">
          <div className="sticky top-24">
            <ActionCard orgs={orgs} events={events} billId={bill.id} billTags={bill.topicTags} />
          </div>
        </div>
      </div>
    </div>
  );
}
