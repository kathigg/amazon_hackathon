import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-navy text-white/70 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🏛️</span>
              <span className="font-display text-white text-lg font-bold">CivicConnect</span>
            </div>
            <p className="text-sm leading-relaxed">
              Making U.S. federal legislation accessible to every American through AI-powered plain-language summaries.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/bills" className="hover:text-white transition-colors">Active Bills</Link></li>
              <li><Link href="/orgs" className="hover:text-white transition-colors">Organizations</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Data Sources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Congress.gov API</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 mt-8 pt-8 text-sm text-center">
          CivicConnect is a nonpartisan platform. AI summaries are generated automatically and may contain errors.{" "}
          <Link href="/about" className="underline hover:text-white">Learn about our methodology.</Link>
        </div>
      </div>
    </footer>
  );
}
