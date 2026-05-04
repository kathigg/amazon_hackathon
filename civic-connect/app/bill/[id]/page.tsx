import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle, Clock } from "lucide-react";
import { getBillOrFetch } from "@/lib/getBillOrFetch";
import { getViewerLocation } from "@/lib/viewer-location";
import { getRepsByStateName, type RepSummary } from "@/lib/getRepsByState";
import { getRepsByZip } from "@/lib/getRepsByZip";
import StanceCard from "@/components/StanceCard";
import ActionCard from "@/components/ActionCard";
import FeedbackButton from "@/components/FeedbackButton";
import SummaryLoading from "@/components/SummaryLoading";
import BillProgressFlow from "@/components/BillProgressFlow";
import PageViewTracker from "@/components/PageViewTracker";
import BillViewTracker from "@/components/BillViewTracker";
import RepresentativeStances from "@/components/RepresentativeStances";
import BillIssueVisual from "@/components/BillIssueVisual";
import { getCurrentUser } from "@/lib/user-tracking";
import { getBillChamberFocus } from "@/lib/legislative";
import { getRelatedOrganizationsAndEvents } from "@/lib/organization-matching";
import { getSummaryPreview } from "@/lib/bill-summary";
import { formatTopicTag } from "@/lib/topics";
import { parseTerm } from "@/lib/taxonomy";
import { formatBillDate } from "@/lib/bill-dates";

export const dynamic = "force-dynamic";

async function getBill(id: string) {
  return getBillOrFetch(id);
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
  const bill = await getBill(params.id);
  if (!bill) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="mb-3 font-display text-3xl font-bold text-navy">
          Bill Not Found
        </h1>
        <p className="mb-4 text-gray-500">
          We couldn&apos;t find or fetch{" "}
          <code className="rounded bg-gray-100 px-2 py-0.5 text-sm">
            {params.id}
          </code>
          .
        </p>
        <p className="mb-8 text-sm text-gray-400">
          Make sure the bill ID is in the format{" "}
          <code className="rounded bg-gray-100 px-1">hr-1-119</code>{" "}
          (type-number-congress), and that your Congress.gov API key is valid.
        </p>
        <Link href="/bills" className="btn-primary inline-block">
          Back to Bills
        </Link>
      </div>
    );
  }

  const currentUser = await getCurrentUser().catch(() => null);
  const { orgs, events } = await getRelatedOrganizationsAndEvents(
    bill.topicTags
  );
  const chamberFocus = getBillChamberFocus(bill.status, bill.type);
  const plainLanguage = getSummaryPreview(bill.summary?.plainLanguage);
  const whyItMatters = getSummaryPreview(bill.summary?.whyItMatters);

  const viewerLocation = getViewerLocation(
    searchParams.devState ?? null,
    searchParams.devPostal ?? null
  );
  const preferredZipCode = currentUser?.zipCode?.trim() || null;
  const zipForLookup = preferredZipCode || viewerLocation.postalCode || null;

  let viewerReps: RepSummary[] = [];
  if (zipForLookup) {
    viewerReps = await getRepsByZip(zipForLookup);
  }
  if (viewerReps.length === 0 && viewerLocation.stateName) {
    viewerReps = await getRepsByStateName(viewerLocation.stateName);
  }
  const viewerStateName = viewerReps[0]?.state ?? viewerLocation.stateName ?? null;

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
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-6 lg:px-8">
      <PageViewTracker billId={bill.id} />
      <BillViewTracker billId={bill.id} topics={bill.topicTags} />

      <Link
        href="/bills"
        className="mb-5 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-navy"
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

                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  {bill.type} {bill.number} · {bill.congress}th Congress
                </span>

                <h1 className="mt-2 mb-6 font-display text-2xl font-bold leading-tight text-navy md:text-3xl">
                  {bill.title}
                </h1>

                <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
                  <StatusIcon status={bill.status} />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Current Status
                    </p>
                    <p className="text-sm font-medium text-navy">
                      {bill.status}
                    </p>
                  </div>
                </div>
              </div>

              <BillIssueVisual
                billId={bill.id}
                title={bill.title}
                imageThumbnailUrl={bill.imageThumbnailUrl}
                imageUrl={bill.imageUrl}
                imageTitle={bill.imageTitle}
                imageCreator={bill.imageCreator}
                imageLicense={bill.imageLicense}
                imageLicenseVersion={bill.imageLicenseVersion}
                className="h-52 w-full md:h-64"
                preferFull
                showAttribution={false}
              />
            </div>

            {bill.imagePageUrl && (
              <div className="mt-4 text-xs text-gray-500">
                <span className="font-medium text-gray-600">
                  Illustrative image:
                </span>{" "}
                <a
                  href={bill.imagePageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-civic-blue hover:underline"
                >
                  View original image
                </a>
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
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
            </div>
          </div>

          <BillProgressFlow status={bill.status} />

          <div className="card p-6 sm:p-8">
            {bill.summary &&
            (plainLanguage || bill.summary.keyProvisions.length > 0 || whyItMatters) ? (
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
                  <p className="mb-6 leading-relaxed text-gray-700">
                    {plainLanguage}
                  </p>
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

                {(whyItMatters || plainLanguage) && (
                  <div className="mt-6 rounded-xl border border-civic-gold/30 bg-civic-gold/10 p-4">
                    <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy">
                      <span className="text-civic-gold">★</span> Why It Matters
                      And Who It Affects
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-700">
                      {whyItMatters || plainLanguage}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <SummaryLoading />
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
              viewerStateName={viewerStateName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
