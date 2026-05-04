import {
  getStanceDisplayLabel,
  listBillRepresentativePositions,
  type BillRepresentativePosition,
} from "@/lib/rep-positions";
import {
  getChamberLabel,
  getRepresentativeLabel,
  type ChamberFocus,
} from "@/lib/legislative";

interface RepresentativeStancesProps {
  billId: string;
  chamber?: ChamberFocus;
  preferredRepBioguideIds?: string[];
}

export default async function RepresentativeStances({
  billId,
  chamber = "both",
  preferredRepBioguideIds = [],
}: RepresentativeStancesProps) {
  const positions = await listBillRepresentativePositions({
    billId,
    chamber,
    preferredRepBioguideIds,
  });

  if (positions.length === 0) {
    return null;
  }

  const support = positions.filter(
    (position) =>
      position.stance === "strong_support" ||
      position.stance === "possible_support"
  );
  const oppose = positions.filter(
    (position) =>
      position.stance === "strong_reject" ||
      position.stance === "possible_reject"
  );
  const noPosition = positions.filter((position) => position.stance === "neutral");
  const preferred = positions.filter((position) => position.isPreferred);
  const chamberLabel = getChamberLabel(chamber);
  const representativeLabel = getRepresentativeLabel(chamber);

  return (
    <section className="space-y-6">
      <div className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              Auto-Whip
            </p>
            <h2 className="mt-2 font-display text-3xl leading-none text-navy">
              Where {chamberLabel} {representativeLabel} currently stand
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-navy/68">
              Built from official statements, public releases, and voting records where they exist. Members without enough evidence are marked as no position.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 border border-black/10 bg-[#f6f1e7] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/55">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {positions.length} tracked
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <CountCard label="Support" count={support.length} tone="green" />
          <CountCard label="No Position" count={noPosition.length} tone="stone" />
          <CountCard label="Oppose" count={oppose.length} tone="red" />
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-black/5">
          <div className="flex h-full w-full">
            <div
              className="bg-green-600"
              style={{ width: `${(support.length / positions.length) * 100}%` }}
            />
            <div
              className="bg-stone-300"
              style={{ width: `${(noPosition.length / positions.length) * 100}%` }}
            />
            <div
              className="bg-red-600"
              style={{ width: `${(oppose.length / positions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {preferred.length > 0 && (
        <div className="card p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
            Your Delegation
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {preferred.map((position) => (
              <RepresentativeCard
                key={position.bioguideId}
                position={position}
                emphasize
              />
            ))}
          </div>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <div className="space-y-4">
          <PositionGroup
            title="Support"
            subtitle="Members whose public record points toward backing the bill."
            positions={support}
            defaultOpen
          />
          <PositionGroup
            title="Opposition"
            subtitle="Members whose public record points toward opposition."
            positions={oppose}
            defaultOpen
          />
          <PositionGroup
            title="No Position"
            subtitle="Members we are still tracking, but without enough public evidence yet."
            positions={noPosition}
            defaultOpen={false}
          />
        </div>
      </div>
    </section>
  );
}

function CountCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "green" | "red" | "stone";
}) {
  const toneClasses = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    stone: "bg-stone-100 text-stone-700",
  }[tone];

  return (
    <div className={`border border-black/10 p-4 ${toneClasses}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.24em]">
        {label}
      </div>
    </div>
  );
}

function PositionGroup({
  title,
  subtitle,
  positions,
  defaultOpen,
}: {
  title: string;
  subtitle: string;
  positions: BillRepresentativePosition[];
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="border border-black/10 bg-[#fcfaf6] p-4 open:bg-white"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy/70">
              {title}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-navy/62">
              {subtitle}
            </p>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-navy/45">
            {positions.length}
          </span>
        </div>
      </summary>

      {positions.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {positions.map((position) => (
            <RepresentativeCard
              key={position.bioguideId}
              position={position}
              emphasize={position.isPreferred}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-navy/55">No members in this group yet.</p>
      )}
    </details>
  );
}

function RepresentativeCard({
  position,
  emphasize = false,
}: {
  position: BillRepresentativePosition;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`border p-4 ${
        emphasize ? "border-navy bg-navy text-white" : "border-black/10 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${emphasize ? "text-white" : "text-navy"}`}>
            {position.name}
          </p>
          <p
            className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              emphasize ? "text-white/70" : "text-navy/45"
            }`}
          >
            {position.party}-{position.state}
            {position.district ? ` · District ${position.district}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            emphasize
              ? "bg-white/15 text-white"
              : position.stance === "strong_support" ||
                  position.stance === "possible_support"
                ? "bg-green-50 text-green-700"
                : position.stance === "strong_reject" ||
                    position.stance === "possible_reject"
                  ? "bg-red-50 text-red-700"
                  : "bg-stone-100 text-stone-700"
          }`}
        >
          {getStanceDisplayLabel(position.stance)}
        </span>
      </div>

      {position.reasoning && (
        <p
          className={`mt-3 text-sm leading-6 ${
            emphasize ? "text-white/80" : "text-navy/68"
          }`}
        >
          {position.reasoning}
        </p>
      )}

      {position.websiteUrl && (
        <a
          href={position.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-4 inline-flex text-[11px] font-semibold uppercase tracking-[0.18em] ${
            emphasize ? "text-white" : "text-civic-blue"
          }`}
        >
          Contact via official website
        </a>
      )}
    </div>
  );
}
