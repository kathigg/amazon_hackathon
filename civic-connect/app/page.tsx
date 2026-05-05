import Link from "next/link";
import BillLookup from "@/components/BillLookup";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import HomeFeedClient from "@/components/HomeFeedClient";
import { getActiveTaxonomy } from "@/lib/taxonomy";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

export const revalidate = 300;

export default async function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="border-b border-black/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/50 sm:px-6 lg:px-8">
          <span>Front Page</span>
          <span>Updated throughout the day</span>
        </div>
      </section>
      <HomeFeedClient />

      <section className="border-b border-black/10">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="border border-black/10 bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                Bill Lookup
              </p>
              <h2 className="mt-3 font-display text-3xl text-navy">
                Search a bill by name or number
              </h2>
              <p className="mt-3 text-sm leading-7 text-navy/68">
                Drop in a bill ID like{" "}
                <span className="font-semibold">hr-1-119</span> or a keyword
                and CivicConnect will take you straight to the filing.
              </p>
              <div className="mt-6">
                <ClientErrorBoundary>
                  <BillLookup />
                </ClientErrorBoundary>
              </div>
            </div>

            <div className="border border-black/10 bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                Reader Profile
              </p>
              <h2 className="mt-3 font-display text-3xl text-navy">
                Build your own congressional briefing
              </h2>
              <p className="mt-3 text-sm leading-7 text-navy/68">
                Add your email, pick your policy areas, choose your briefing
                schedule, and tell us which senators or House members to
                surface first.
              </p>
              <Link
                href="/account"
                className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
              >
                Start Your Desk
              </Link>
            </div>

            <div className="border border-black/10 bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                Browse the Desks
              </p>
              <h2 className="mt-3 font-display text-3xl text-navy">
                Track a policy beat
              </h2>
              <div className="mt-5 space-y-4">
                {ACTIVE_TAXONOMY.groups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-navy/40">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.terms.map((topic) => (
                        <Link
                          key={topic}
                          href={`/bills?topic=${encodeURIComponent(topic)}`}
                          className="border border-black/10 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-navy/70 transition-colors hover:border-navy hover:text-navy"
                        >
                          {topic}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
