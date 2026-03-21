import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-display text-4xl font-bold text-navy mb-4">About CivicConnect</h1>
      <p className="text-gray-500 text-lg mb-12 leading-relaxed">
        CivicConnect is a nonpartisan platform that makes U.S. federal legislation accessible to every American.
      </p>

      <div className="space-y-12">
        <section>
          <h2 className="font-display text-2xl font-bold text-navy mb-3">Our Mission</h2>
          <p className="text-gray-700 leading-relaxed">
            Federal laws are written in dense legal language that most Americans can't easily parse. Research shows that U.S. federal laws remain deeply inaccessible despite decades of plain-language mandates. CivicConnect bridges that gap by using AI to translate legislation into plain English — so you can understand what Congress is actually doing.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-navy mb-3">How It Works</h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "We fetch live bill data",
                desc: "Bill metadata, status, and text are pulled daily from the Congress.gov API and ProPublica Congress API.",
              },
              {
                step: "2",
                title: "AI generates plain-language summaries",
                desc: "GPT-4o reads each bill and produces a 2–3 sentence summary at an 8th-grade reading level, plus key provisions. The official title is always shown alongside the AI summary.",
              },
              {
                step: "3",
                title: "Party positions are sourced from voting records",
                desc: "Stance cards show how Democrats and Republicans voted on each bill, drawn from ProPublica vote data. We never editorialize.",
              },
              {
                step: "4",
                title: "You take action",
                desc: "Find advocacy organizations in your area, attend events, and contact your representatives directly.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-civic-blue text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-navy">{item.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-navy mb-3">Bias Policy</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            AI-generated summaries are instructed to use neutral, factual language. We display the official bill title alongside every AI summary so you can compare. If you believe a summary is biased, use the "Flag as biased" button on any bill page — flagged summaries are reviewed by our team.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Party stance data reflects voting records and official statements only. We do not add editorial framing or characterize positions as good or bad.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-navy mb-3">Data Sources</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>
              <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className="text-civic-blue hover:underline">Congress.gov API</a>
              {" "}— Bill metadata, status, sponsor, and full text
            </li>
            <li>
              <a href="https://projects.propublica.org/api-docs/congress-api/" target="_blank" rel="noopener noreferrer" className="text-civic-blue hover:underline">ProPublica Congress API</a>
              {" "}— Vote records and party breakdowns
            </li>
            <li>
              <a href="https://developers.google.com/civic-information" target="_blank" rel="noopener noreferrer" className="text-civic-blue hover:underline">Google Civic Information API</a>
              {" "}— Representative lookup by zip code
            </li>
          </ul>
        </section>

        <div className="bg-navy text-white rounded-card p-8 text-center">
          <h2 className="font-display text-2xl font-bold mb-3">Ready to get informed?</h2>
          <p className="text-white/70 mb-6">Browse active bills and see what Congress is working on right now.</p>
          <Link href="/bills" className="bg-white text-navy px-8 py-3 rounded-full font-semibold hover:bg-cream transition-colors inline-block">
            Explore Bills
          </Link>
        </div>
      </div>
    </div>
  );
}
