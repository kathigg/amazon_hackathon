import Link from "next/link";
import CivicConnectMark from "@/components/CivicConnectMark";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-black/10 bg-[#f6f1e7] text-navy/70">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <CivicConnectMark />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                  Latest legislation, decoded.
                </p>
                <span className="font-display text-4xl leading-none text-navy">CivicConnect</span>
              </div>
            </div>
            <p className="text-sm leading-7">
              Making U.S. federal legislation accessible to every American through AI-powered plain-language summaries.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/bills" className="hover:text-navy transition-colors">Active Bills</Link></li>
              <li><Link href="/orgs" className="hover:text-navy transition-colors">Organizations</Link></li>
              <li><Link href="/about" className="hover:text-navy transition-colors">About</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">Data Sources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className="hover:text-navy transition-colors">Congress.gov API</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-black/10 pt-8 text-center text-sm">
          CivicConnect is a nonpartisan platform. AI summaries are generated automatically and may contain errors.{" "}
          <Link href="/about" className="underline hover:text-navy">Learn about our methodology.</Link>
        </div>
      </div>
    </footer>
  );
}
