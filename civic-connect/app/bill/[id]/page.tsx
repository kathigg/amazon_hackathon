import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle, Clock } from "lucide-react";
import { getBillOrFetch } from "@/lib/getBillOrFetch";
import { getViewerLocation } from "@/lib/viewer-location";
import { getRepsByStateName, type RepSummary } from "@/lib/getRepsByState";
import { getRepsByZip } from "@/lib/getRepsByZip";
import StanceCard from "@/components/StanceCard";
import ActionCard from "@/components/ActionCard";
import FeedbackButton from "@/components/FeedbackButton";
import BillProgressFlow from "@/components/BillProgressFlow";
import BillViewTracker from "@/components/BillViewTracker";
import RepresentativeStances from "@/components/RepresentativeStances";
import BillIssueVisual from "@/components/BillIssueVisual";
import BillSummaryPanel from "@/components/BillSummaryPanel";
import RelativeTime from "@/components/RelativeTime";
import { getCurrentUser } from "@/lib/user-tracking";
import { getBillChamberFocus } from "@/lib/legislative";
import { getRelatedOrganizationsAndEvents } from "@/lib/organization-matching";
import {
  getSummaryPreview,
  splitParagraphs,
  splitWhyAndWho,
} from "@/lib/bill-summary";
import { formatTopicTag } from "@/lib/topics";
import { parseTerm } from "@/lib/taxonomy";
import {
  formatBillDate,
  formatBillDateTime,
  formatBillShortDate,
} from "@/lib/bill-dates";
import { withTimeout } from "@/lib/with-timeout";
import { fetchBillText } from "@/lib/congress";
import { preprocessBillText } from "@/lib/bill-text";
import MilestonePill from "@/components/MilestonePill";
import type { ProgressStage } from "@/lib/bill-progress";

export const dynamic = "force-dynamic";

async function getBill(id: string) {
  return getBillOrFetch(id);
}

async function getBillTextPreview(bill: {
  congress: number;
  type: string;
  number: string;
}) {
  const textUrl = await withTimeout(
    () => fetchBillText(bill.congress, bill.type, bill.number),
    1_500,
    null
  );
  if (!textUrl) return null;

  const raw = await withTimeout(
    () =>
      fetch(textUrl, { next: { revalidate: 86_400 } }).then((res) =>
        res.ok ? res.text() : null
      ),
    2_500,
    null
  );
  if (!raw) return null;

  const cleaned = preprocessBillText(raw);
  if (!cleaned) return null;

  return {
    textUrl,
    preview: cleaned.length > 3_000 ? `${cleaned.slice(0, 3_000)}…` : cleaned,
  };
}

function StatusIcon({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower.includes("became law") || lower.includes("signed")) {
    return <CheckCircle className="text-green-500" size={20} />;
  }
  if (lower.includes("passed")) {
    return <CheckCircle className="text-blue-500" size={20} />;
  }
  if (lower.includes("introduced")) {
    return <Clock className="text-amber-500" size={20} />;
  }
  return <AlertCircle className="text-gray-400" size={20} />;
}

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { devState?: string; devPostal?: string };
}) {
  let bill = null;
  try {
    // Avoid timing out the critical bill fetch: Next.js will show `loading.tsx`
    // while this resolves. Timing out early makes new bills feel "broken".
    bill = await getBill(params.id);
  } catch {
    bill = null;
  }
  if (!bill) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="mb-3 font-display text-3xl font-bold text-navy">
          Bill Temporarily Unavailable
        </h1>
        <p className="mb-4 text-gray-500">
          We couldn&apos;t load{" "}
          <code className="rounded bg-gray-100 px-2 py-0.5 text-sm">
            {params.id}
          </code>{" "}
          right now.
        </p>
        <p className="mb-8 text-sm text-gray-400">
          The bill database is responding slowly. Try again shortly or head
          back to the bills feed while we recover.
        </p>
        <Link href="/bills" className="btn-primary inline-block">
          Back to Bills
        </Link>
      </div>
    );
  }

  const currentUser = await withTimeout(
    () => getCurrentUser().catch(() => null),
    800,
    null
  );
  const { orgs, events } = await withTimeout(
    () =>
      getRelatedOrganizationsAndEvents(
        bill.topicTags
      ).catch(() => ({ orgs: [], events: [] })),
    1_500,
    { orgs: [], events: [] }
  );
  const chamberFocus = getBillChamberFocus(bill.status, bill.type);
  const stageDate = bill.stageReachedAt ?? bill.latestActionAt;
  const stageAbsolute = stageDate ? formatBillShortDate(stageDate) : null;
  const stageText = bill.latestActionText || bill.status;
  const plainLanguage = getSummaryPreview(bill.summary?.plainLanguage);
  const whyItMatters = getSummaryPreview(bill.summary?.whyItMatters);
  const hasUsableSummary =
    Boolean(plainLanguage) ||
    Boolean(whyItMatters) ||
    (bill.summary?.keyProvisions?.length ?? 0) > 0;

  const billText = await getBillTextPreview(bill);

  const viewerLocation = getViewerLocation(
    searchParams.devState ?? null,
    searchParams.devPostal ?? null
  );
  const preferredZipCode = currentUser?.zipCode?.trim() || null;
  const zipForLookup = preferredZipCode || viewerLocation.postalCode || null;

  let viewerReps: RepSummary[] = [];
  if (zipForLookup) {
    viewerReps = await withTimeout(
      () => getRepsByZip(zipForLookup).catch(() => []),
      1_500,
      []
    );
  }
  const viewerStateName = viewerLocation.stateName;

  if (viewerReps.length === 0 && viewerStateName) {
    viewerReps = await withTimeout(
      () => getRepsByStateName(viewerStateName).catch(() => []),
      1_500,
      []
    );
  }
  const resolvedViewerStateName = viewerReps[0]?.state ?? viewerStateName ?? null;

  type StanceWithCosponsors = {
    id: string;
    billId: string;
    party: string;
    position: string;
    voteYes: number;
    voteNo: number;
    cosponsors?: number;
    source: string;
  };
  const demStance = bill.stances.find(
    (stance: StanceWithCosponsors) => stance.party === "Democrat"
  ) as StanceWithCosponsors | undefined;
  const repStance = bill.stances.find(
    (stance: StanceWithCosponsors) => stance.party === "Republican"
  ) as StanceWithCosponsors | undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-1 sm:px-6 lg:px-8">
      <BillViewTracker billId={bill.id} topics={bill.topicTags} />

      <Link
        href="/bills"
        className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-navy"
      >
        <ArrowLeft size={16} /> Back to Bills
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <div className="card p-6 sm:p-8">
            <div className="grid gap-6 md:grid-cols-[1fr_270px] md:items-start">
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {bill.topicTags.map((tag: string) => {
                    const human = parseTerm(tag)?.value ?? tag;
                    return (
                      <Link
                        key={tag}
                        href={`/bills?topic=${encodeURIComponent(human)}`}
                        className="tag bg-blue-50 text-civic-blue transition-colors hover:bg-civic-blue hover:text-white"
                      >
                        {formatTopicTag(tag)}
                      </Link>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    {bill.type} {bill.number} · {bill.congress}th Congress
                  </span>
                  {bill.progressStage && (
                    <MilestonePill
                      stage={bill.progressStage as ProgressStage}
                      billType={bill.type}
                    />
                  )}
                </div>

                <h1 className="mt-2 mb-6 font-display text-2xl font-bold leading-tight text-navy md:text-3xl">
                  {bill.title}
                </h1>

                <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
                  <StatusIcon status={bill.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Latest update
                      {stageAbsolute && (
                        <span className="ml-2 text-gray-700 normal-case tracking-normal">
                          {stageAbsolute}
                        </span>
                      )}
                      <RelativeTime
                        value={stageDate}
                        className="ml-2 text-gray-400 normal-case tracking-normal"
                      />
                    </p>
                    <p
                      className="mt-1 text-sm font-medium text-navy"
                      title={
                        bill.latestActionAt
                          ? formatBillDateTime(bill.latestActionAt)
                          : undefined
                      }
                    >
                      {stageText}
                    </p>
                  </div>
                </div>
              </div>

              <BillIssueVisual
                billId={bill.id}
                title={bill.title}
                topicLabel={
                  bill.topicTags[0] ? formatTopicTag(bill.topicTags[0]) : "General"
                }
                topicTags={bill.topicTags}
                imageUrl={bill.imageUrl}
                className="h-52 w-full md:h-64"
                preferFull
              />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                  Sponsor
                </p>
                <p className="font-medium text-navy">{bill.sponsor}</p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                  Introduced
                </p>
                <p className="font-medium text-navy">
                  {formatBillDate(bill.introducedAt)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                  Latest action
                </p>
                <p className="font-medium text-navy">
                  {bill.latestActionAt
                    ? formatBillDate(bill.latestActionAt)
                    : formatBillDate(bill.introducedAt)}
                </p>
              </div>
            </div>
          </div>

          <BillProgressFlow status={bill.status} />

          <div className="card p-6 sm:p-8">
            {bill.summary && hasUsableSummary ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-navy">Plain-Language Summary</h2>
                    <span className="tag bg-amber-100 text-xs text-amber-700">
                      AI Generated
                    </span>
                  </div>
                  <FeedbackButton billId={bill.id} />
                </div>
                {plainLanguage && (
                  <div className="mb-6 space-y-4 leading-relaxed text-gray-700">
                    {splitParagraphs(plainLanguage).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                )}

                {bill.summary.keyProvisions.length > 0 && (
                  <div>
                    <h3 className="mb-3 font-semibold text-navy">
                      Key Provisions
                    </h3>
                    <ul className="space-y-2">
                      {bill.summary.keyProvisions.map(
                        (provision: string, index: number) => (
                          <li
                            key={index}
                            className="flex items-start gap-3 text-sm text-gray-700"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-civic-blue text-xs text-white">
                              {index + 1}
                            </span>
                            {provision}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {(whyItMatters || plainLanguage) &&
                  (() => {
                    const { why, who } = splitWhyAndWho(
                      whyItMatters || plainLanguage || ""
                    );
                    const gridCols = who ? "md:grid-cols-2" : "grid-cols-1";
                    const boxClass =
                      "w-full rounded-xl border p-4";
                    return (
                      <div className={`mt-6 grid gap-4 ${gridCols}`}>
                        <div className={`${boxClass} border-civic-gold/30 bg-civic-gold/10`}>
                          <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy">
                            <span className="text-civic-gold">★</span> Why this matters
                          </h3>
                          <p className="text-sm leading-relaxed text-gray-700">
                            {why}
                          </p>
                        </div>
                        {who && (
                          <div className={`${boxClass} border-civic-blue/30 bg-civic-blue/10`}>
                            <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy">
                              <span className="text-civic-blue">●</span> Who this affects
                            </h3>
                            <p className="text-sm leading-relaxed text-gray-700">
                              {who}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>
            ) : bill.summary ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-navy">Plain-Language Summary</h2>
                    <span className="tag bg-gray-100 text-xs text-gray-600">
                      Unavailable
                    </span>
                  </div>
                  <FeedbackButton billId={bill.id} />
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  We couldn&apos;t generate a plain-English summary for this bill
                  right now. You can still read the official bill text below.
                </p>
              </div>
            ) : (
              <BillSummaryPanel billId={bill.id} />
            )}
          </div>

          <div className="card p-6 sm:p-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-navy">Bill Text</h2>
              {billText?.textUrl ? (
                <a
                  href={billText.textUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-civic-blue hover:underline"
                >
                  View on Congress.gov
                </a>
              ) : null}
            </div>

            {billText ? (
              <details className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <summary className="cursor-pointer select-none text-sm font-medium text-navy">
                  Show / hide bill text preview
                </summary>
                <pre className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                  {billText.preview}
                </pre>
              </details>
            ) : (
              <p className="text-sm text-gray-500">
                Bill text is temporarily unavailable.
              </p>
            )}
          </div>

          <RepresentativeStances
            billId={bill.id}
            chamber={chamberFocus}
            preferredRepBioguideIds={currentUser?.preferredRepBioguideIds ?? []}
          />

          {(demStance || repStance) && (
            <div id="stances">
              <h2 className="mb-2 font-display text-2xl font-bold text-navy">
                Party Positions
              </h2>

              {(() => {
                const totalEndorsed =
                  (demStance?.cosponsors ?? 0) + (repStance?.cosponsors ?? 0);
                const totalVoted =
                  (demStance?.voteYes ?? 0) +
                  (demStance?.voteNo ?? 0) +
                  (repStance?.voteYes ?? 0) +
                  (repStance?.voteNo ?? 0);

                if (totalEndorsed === 0 && totalVoted === 0) return null;

                return (
                  <div className="mb-4 flex flex-wrap gap-4 rounded-xl bg-gray-50 p-4 text-sm">
                    {totalEndorsed > 0 && (
                      <span className="text-navy">
                        <span className="font-bold">{totalEndorsed}</span>{" "}
                        members formally cosponsored
                      </span>
                    )}
                    {totalVoted > 0 && (
                      <span className="text-navy">
                        <span className="font-bold">{totalVoted}</span> members
                        cast a recorded vote
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {demStance && (
                  <StanceCard
                    party="Democrat"
                    position={demStance.position}
                    voteYes={demStance.voteYes}
                    voteNo={demStance.voteNo}
                    cosponsors={demStance.cosponsors ?? 0}
                    source={demStance.source}
                  />
                )}
                {repStance && (
                  <StanceCard
                    party="Republican"
                    position={repStance.position}
                    voteYes={repStance.voteYes}
                    voteNo={repStance.voteNo}
                    cosponsors={repStance.cosponsors ?? 0}
                    source={repStance.source}
                  />
                )}
              </div>
              <p className="mt-3 text-xs text-gray-400">
                Cosponsor data and vote records sourced from Congress.gov.
                Reflects formal legislative actions only.
              </p>
            </div>
          )}
        </div>

        <div id="action" className="lg:col-span-1">
          <div className="sticky top-24">
            <ActionCard
              orgs={orgs}
              events={events}
              billId={bill.id}
              billTags={bill.topicTags}
              viewerReps={viewerReps}
              viewerStateName={resolvedViewerStateName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
