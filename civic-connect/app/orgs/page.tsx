import { prisma } from "@/lib/prisma";
import { TOPIC_TAGS } from "@/lib/topics";
import Link from "next/link";
import OrgCard from "@/components/OrgCard";

export const dynamic = "force-dynamic";

async function getOrgs(topic?: string) {
  return prisma.organization.findMany({
    where: topic ? { topicTags: { has: topic } } : undefined,
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
  searchParams: { topic?: string };
}) {
  const orgs = await getOrgs(searchParams.topic);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="font-display text-4xl font-bold text-navy mb-2">Organizations</h1>
          <p className="text-gray-500">Connect with advocacy groups active on the issues you care about.</p>
        </div>
        <Link href="/orgs/register" className="btn-primary text-sm self-start md:self-auto">
          + Register Your Org
        </Link>
      </div>

      {/* Topic filters */}
      <div className="flex flex-wrap gap-2 mb-10">
        <Link
          href="/orgs"
          className={`tag px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            !searchParams.topic ? "bg-navy text-white border-navy" : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
          }`}
        >
          All
        </Link>
        {TOPIC_TAGS.map((tag) => (
          <Link
            key={tag}
            href={`/orgs?topic=${encodeURIComponent(tag)}`}
            className={`tag px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
              searchParams.topic === tag ? "bg-navy text-white border-navy" : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
            }`}
          >
            {tag}
          </Link>
        ))}
      </div>

      {orgs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 text-gray-400">
          <p className="text-5xl mb-4">🏢</p>
          <p className="text-lg">No organizations found for this topic yet.</p>
          <Link href="/orgs/register" className="btn-primary inline-block mt-6 text-sm">
            Be the first to register
          </Link>
        </div>
      )}
    </div>
  );
}
