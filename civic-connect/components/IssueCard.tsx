import Link from "next/link";
import clsx from "clsx";
import { formatTerm, getTermColor } from "@/lib/taxonomy";
import { formatBillShortDate } from "@/lib/bill-dates";

interface IssueCardProps {
  id: string;
  title: string;
  plainLanguage?: string;
  status: string;
  sponsor: string;
  topicTags: string[];
  introducedAt: Date | string;
}

// Ordered by proximity to passing — furthest to closest
const STATUS_LEVELS: Array<{ keywords: string[]; classes: string }> = [
  // ✅ Enacted — green
  { keywords: ["became law", "signed by president", "enacted"], classes: "bg-green-100 text-green-800 border border-green-300" },
  // 🔵 Passed both chambers
  { keywords: ["passed senate", "passed house", "agreed to in senate", "agreed to in house"], classes: "bg-blue-100 text-blue-800 border border-blue-300" },
  // 🟣 Sent to president / resolving differences
  { keywords: ["presented to president", "resolving differences", "conference"], classes: "bg-violet-100 text-violet-800 border border-violet-300" },
  // 🟠 Passed one chamber
  { keywords: ["passed"], classes: "bg-orange-100 text-orange-800 border border-orange-300" },
  // 🟡 Active in committee / floor
  { keywords: ["ordered to be reported", "reported", "placed on", "floor", "amendment"], classes: "bg-yellow-100 text-yellow-800 border border-yellow-300" },
  // 🔵 Referred to committee
  { keywords: ["referred to"], classes: "bg-sky-100 text-sky-700 border border-sky-300" },
  // ⚪ Introduced — furthest from passing
  { keywords: ["introduced", "received in the senate", "received in the house"], classes: "bg-gray-100 text-gray-600 border border-gray-300" },
];

function statusColor(status: string) {
  const lower = status.toLowerCase();
  for (const level of STATUS_LEVELS) {
    if (level.keywords.some((kw) => lower.includes(kw))) return level.classes;
  }
  return "bg-amber-100 text-amber-700 border border-amber-300";
}

export default function IssueCard({
  id,
  title,
  plainLanguage,
  status,
  sponsor,
  topicTags,
  introducedAt,
}: IssueCardProps) {
  const date = formatBillShortDate(introducedAt);

  return (
    <Link href={`/bill/${id}`} className="block group">
      <article className="card p-6 h-full flex flex-col gap-4 cursor-pointer">
        {/* Status badge — full width across top, unchanged */}
        <span className={clsx("status-badge w-full text-center", statusColor(status))}>
          {status.length > 40 ? status.slice(0, 40) + "…" : status}
        </span>

        {/* Topic tags — below status, left-aligned with unique colors */}
        <div className="flex flex-wrap gap-2 -mt-2">
          {topicTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className={clsx("tag text-xs", getTermColor(tag))}
            >
              {formatTerm(tag)}
            </span>
          ))}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-navy text-base leading-snug group-hover:text-civic-blue transition-colors line-clamp-3">
          {title}
        </h3>

        {/* AI Summary */}
        {plainLanguage ? (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
            {plainLanguage}
          </p>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
          <span>Sponsored by {sponsor}</span>
          <span>{date}</span>
        </div>
      </article>
    </Link>
  );
}
