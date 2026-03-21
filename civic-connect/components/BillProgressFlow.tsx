"use client";

/**
 * BillProgressFlow — visual flowchart of a bill's journey through Congress.
 * Stages are color-coded by branch; unreached stages are greyed out.
 */

import clsx from "clsx";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";

interface Stage {
  id: string;
  label: string;
  sublabel: string;
  color: string;       // active bg
  textColor: string;   // active text
  borderColor: string; // active border
  dotColor: string;    // active dot
}

const STAGES: Stage[] = [
  {
    id: "introduced",
    label: "Introduced",
    sublabel: "Bill filed in chamber",
    color: "bg-sky-50",
    textColor: "text-sky-700",
    borderColor: "border-sky-300",
    dotColor: "text-sky-500",
  },
  {
    id: "committee",
    label: "Committee",
    sublabel: "Reviewed & reported",
    color: "bg-yellow-50",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-300",
    dotColor: "text-yellow-500",
  },
  {
    id: "passed_chamber",
    label: "Passed Chamber",
    sublabel: "House or Senate vote",
    color: "bg-orange-50",
    textColor: "text-orange-700",
    borderColor: "border-orange-300",
    dotColor: "text-orange-500",
  },
  {
    id: "passed_both",
    label: "Passed Both",
    sublabel: "House & Senate agree",
    color: "bg-violet-50",
    textColor: "text-violet-700",
    borderColor: "border-violet-300",
    dotColor: "text-violet-500",
  },
  {
    id: "president",
    label: "President",
    sublabel: "Sent to White House",
    color: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-300",
    dotColor: "text-blue-500",
  },
  {
    id: "enacted",
    label: "Enacted",
    sublabel: "Signed into law",
    color: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-400",
    dotColor: "text-green-500",
  },
];

/** Map raw status text → which stage IDs are completed */
function getCompletedStages(status: string): Set<string> {
  const s = status.toLowerCase();
  const completed = new Set<string>();

  // Always mark introduced if we have any status
  completed.add("introduced");

  if (
    s.includes("referred to") ||
    s.includes("ordered to be reported") ||
    s.includes("reported") ||
    s.includes("placed on") ||
    s.includes("amendment") ||
    s.includes("floor")
  ) {
    completed.add("committee");
  }

  if (s.includes("passed house") || s.includes("passed senate") ||
      s.includes("agreed to in house") || s.includes("agreed to in senate")) {
    completed.add("committee");
    completed.add("passed_chamber");
  }

  if (
    (s.includes("passed house") && s.includes("passed senate")) ||
    s.includes("resolving differences") ||
    s.includes("conference") ||
    s.includes("presented to president") ||
    s.includes("became law") ||
    s.includes("signed") ||
    s.includes("enacted")
  ) {
    completed.add("committee");
    completed.add("passed_chamber");
    completed.add("passed_both");
  }

  if (
    s.includes("presented to president") ||
    s.includes("became law") ||
    s.includes("signed") ||
    s.includes("enacted")
  ) {
    completed.add("president");
  }

  if (s.includes("became law") || s.includes("signed") || s.includes("enacted")) {
    completed.add("enacted");
  }

  return completed;
}

/** Which stage is the current/active one (the frontier) */
function getCurrentStage(completed: Set<string>): string {
  const order = STAGES.map((s) => s.id);
  let current = order[0];
  for (const id of order) {
    if (completed.has(id)) current = id;
  }
  return current;
}

export default function BillProgressFlow({ status }: { status: string }) {
  const completed = getCompletedStages(status);
  const current = getCurrentStage(completed);

  return (
    <div className="card p-6">
      <h2 className="font-bold text-navy mb-1">Legislative Progress</h2>
      <p className="text-xs text-gray-400 mb-6">How far this bill has traveled through Congress</p>

      {/* Desktop: horizontal flow */}
      <div className="hidden sm:flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const done = completed.has(stage.id);
          const isCurrent = stage.id === current;
          const isLast = i === STAGES.length - 1;

          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              {/* Stage node */}
              <div className="flex flex-col items-center flex-1 min-w-0">
                {/* Circle + icon */}
                <div
                  className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    done
                      ? clsx(stage.color, stage.borderColor)
                      : "bg-gray-100 border-gray-200",
                    isCurrent && "ring-2 ring-offset-2 ring-offset-white",
                    isCurrent && stage.borderColor.replace("border-", "ring-")
                  )}
                >
                  {done ? (
                    <CheckCircle2
                      size={20}
                      className={clsx(done ? stage.dotColor : "text-gray-300")}
                    />
                  ) : (
                    <Circle size={20} className="text-gray-300" />
                  )}
                </div>

                {/* Label */}
                <p
                  className={clsx(
                    "text-xs font-semibold mt-2 text-center leading-tight",
                    done ? stage.textColor : "text-gray-400"
                  )}
                >
                  {stage.label}
                </p>
                <p
                  className={clsx(
                    "text-xs mt-0.5 text-center leading-tight hidden lg:block",
                    done ? "text-gray-500" : "text-gray-300"
                  )}
                >
                  {stage.sublabel}
                </p>
              </div>

              {/* Connector arrow */}
              {!isLast && (
                <ChevronRight
                  size={18}
                  className={clsx(
                    "shrink-0 -mx-1",
                    done && completed.has(STAGES[i + 1].id)
                      ? "text-gray-400"
                      : "text-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical flow */}
      <div className="flex sm:hidden flex-col gap-0">
        {STAGES.map((stage, i) => {
          const done = completed.has(stage.id);
          const isCurrent = stage.id === current;
          const isLast = i === STAGES.length - 1;

          return (
            <div key={stage.id} className="flex items-start gap-3">
              {/* Left: dot + line */}
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0",
                    done ? clsx(stage.color, stage.borderColor) : "bg-gray-100 border-gray-200",
                    isCurrent && "ring-2 ring-offset-1 ring-offset-white",
                    isCurrent && stage.borderColor.replace("border-", "ring-")
                  )}
                >
                  {done ? (
                    <CheckCircle2 size={16} className={stage.dotColor} />
                  ) : (
                    <Circle size={16} className="text-gray-300" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={clsx(
                      "w-0.5 h-6 mt-1",
                      done && completed.has(STAGES[i + 1].id) ? "bg-gray-300" : "bg-gray-100"
                    )}
                  />
                )}
              </div>

              {/* Right: text */}
              <div className="pb-4">
                <p className={clsx("text-sm font-semibold", done ? stage.textColor : "text-gray-400")}>
                  {stage.label}
                </p>
                <p className={clsx("text-xs", done ? "text-gray-500" : "text-gray-300")}>
                  {stage.sublabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current status text */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Latest Action</p>
        <p className="text-sm text-navy font-medium">{status}</p>
      </div>
    </div>
  );
}
