import Link from "next/link";

interface Bill {
  id: string;
  title: string;
  status: string;
  stage:
    | "introduced"
    | "committee"
    | "passed_one"
    | "passed_both"
    | "president"
    | "enacted"
    | "vetoed";
}

interface CongressVisualizationProps {
  bills: Bill[];
}

const STAGES: Array<{
  key: Bill["stage"];
  label: string;
  blurb: string;
  tone: string;
}> = [
  {
    key: "introduced",
    label: "Introduced",
    blurb: "Freshly filed and waiting for their first move.",
    tone: "bg-stone-100 text-stone-700",
  },
  {
    key: "committee",
    label: "In Committee",
    blurb: "Under review, markup, or waiting for committee action.",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    key: "passed_one",
    label: "Passed One Chamber",
    blurb: "Through either the House or Senate, but not both yet.",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "passed_both",
    label: "Passed Both Chambers",
    blurb: "Both chambers have acted and the bill is near the finish line.",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    key: "president",
    label: "At The White House",
    blurb: "Presented to the president for signature or veto.",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    key: "enacted",
    label: "Enacted",
    blurb: "Signed into law.",
    tone: "bg-green-100 text-green-800",
  },
  {
    key: "vetoed",
    label: "Vetoed",
    blurb: "Stopped at the White House unless Congress tries again.",
    tone: "bg-red-50 text-red-700",
  },
];

export default function CongressVisualization({
  bills,
}: CongressVisualizationProps) {
  const allGroups = Object.fromEntries(
    STAGES.map((stage) => [
      stage.key,
      bills.filter((bill) => bill.stage === stage.key),
    ])
  ) as Record<Bill["stage"], Bill[]>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {STAGES.map((stage) => {
        const stageBills = (allGroups[stage.key] ?? []).slice(0, 4);
        const stageCount = allGroups[stage.key]?.length ?? 0;

        return (
          <section
            key={stage.key}
            className="border border-black/10 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                  Bills In Motion
                </p>
                <h3 className="mt-2 font-display text-3xl leading-none text-navy">
                  {stage.label}
                </h3>
              </div>
              <span
                className={`inline-flex px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${stage.tone}`}
              >
                {stageCount}
              </span>
            </div>

            <p className="mt-3 text-sm leading-7 text-navy/65">{stage.blurb}</p>

            {stageBills.length > 0 ? (
              <div className="mt-5 space-y-3">
                {stageBills.map((bill) => (
                  <Link
                    key={bill.id}
                    href={`/bill/${bill.id}`}
                    className="block border-t border-black/10 pt-3 transition-colors hover:text-civic-blue"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-navy/45">
                      {bill.id.toUpperCase()}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-navy">
                      {bill.title}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-navy/45">
                No tracked bills in this lane right now.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
