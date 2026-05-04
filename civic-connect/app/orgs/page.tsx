import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  filterPredicateForTopic,
  getActiveTaxonomy,
} from "@/lib/taxonomy";
import OrgCard from "@/components/OrgCard";

export const dynamic = "force-dynamic";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

async function getOrgs(topic?: string, q?: string) {
  return prisma.organization.findMany({
    where: {
      ...(topic
        ? {
            topicTags: {
              hasSome: filterPredicateForTopic(topic),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { mission: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      events: {
        where: { date: { gte: new Date() } },
        orderBy: { date: "asc" },
        take: 2,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: { topic?: string; q?: string };
}) {
  const selected = searchParams.topic;
  const query = searchParams.q?.trim() ?? "";
  const orgs = await getOrgs(selected, query || undefined);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-display text-4xl font-bold text-navy">
            Organizations
          </h1>
          <p className="text-gray-500">
            Search and filter advocacy groups active on the issues our readers
            care about most.
          </p>
        </div>
        <Link
          href="/orgs/register"
          className="btn-primary self-start text-sm md:self-auto"
        >
          + Register Your Org
        </Link>
      </div>

      <form method="GET" className="mb-8 flex flex-col gap-3 sm:flex-row">
        {selected && <input type="hidden" name="topic" value={selected} />}
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search organizations, missions, or locations"
          className="w-full border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
        />
        <button
          type="submit"
          className="border border-navy bg-navy px-6 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-navy/90"
        >
          Search
        </button>
      </form>

      <div className="mb-10 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildOrgsHref({ q: query || undefined })}
            className={`tag rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              !selected
                ? "border-navy bg-navy text-white"
                : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
            }`}
          >
            All
          </Link>
        </div>
        {ACTIVE_TAXONOMY.groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.terms.map((tag) => (
                <Link
                  key={tag}
                  href={buildOrgsHref({
                    topic: tag,
                    q: query || undefined,
                  })}
                  className={`tag rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected === tag
                      ? "border-navy bg-navy text-white"
                      : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
                  }`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {orgs.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center text-gray-400">
          <p className="text-lg">No organizations matched that search yet.</p>
          <Link
            href="/orgs/register"
            className="btn-primary mt-6 inline-block text-sm"
          >
            Be the first to register
          </Link>
        </div>
      )}
    </div>
  );
}

function buildOrgsHref({
  topic,
  q,
}: {
  topic?: string;
  q?: string;
}) {
  const params = new URLSearchParams();

  if (topic) {
    params.set("topic", topic);
  }

  if (q) {
    params.set("q", q);
  }

  const query = params.toString();
  return query ? `/orgs?${query}` : "/orgs";
}
