"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getActiveTaxonomy } from "@/lib/taxonomy";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

// Show pinned terms first, then everything else in `groups[]` order so the
// horizontal scroll surfaces the highest-traffic desks immediately.
const orderedTerms = [
  ...ACTIVE_TAXONOMY.prioritizedTerms,
  ...ACTIVE_TAXONOMY.groups.flatMap((g) =>
    g.terms.filter((t) => !ACTIVE_TAXONOMY.prioritizedTerms.includes(t))
  ),
];

const categoryItems = [
  { label: "Hot", href: "/bills?sort=hot", type: "sort" as const, value: "hot" },
  { label: "Latest", href: "/bills", type: "sort" as const, value: "latest" },
  ...orderedTerms.map((topic) => ({
    label: topic,
    href: `/bills?topic=${encodeURIComponent(topic)}`,
    type: "topic" as const,
    value: topic,
  })),
];

export default function BillCategoryBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTopic = searchParams.get("topic");
  const activeSort = searchParams.get("sort") ?? "latest";
  const isPersonalized = searchParams.get("personalized") === "true";

  return (
    <div className="sticky top-0 z-40 border-y border-black/10 bg-[#f6f1e7]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <span className="hidden shrink-0 pr-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-navy/50 md:inline">
          Bills Desk
        </span>
        {categoryItems.map((item) => {
          const isActive =
            pathname === "/bills" &&
            !isPersonalized &&
            (item.type === "topic"
              ? activeTopic === item.value
              : !activeTopic && activeSort === item.value);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                isActive
                  ? "border-navy bg-navy text-white"
                  : "border-black/10 bg-white/70 text-navy/75 hover:border-navy hover:text-navy"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
