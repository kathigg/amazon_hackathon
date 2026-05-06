"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { parseImpactSections } from "@/lib/bill-summary";

type SummaryPayload = {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
};

type SummaryStatus = "pending" | "ready" | "unavailable";

export default function BillSummaryPanel({ billId }: { billId: string }) {
  const [status, setStatus] = useState<SummaryStatus>("pending");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [seconds, setSeconds] = useState(0);
  const pollTimer = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);

  async function fetchStatus(signal?: AbortSignal) {
    const res = await fetch(`/api/bills/${billId}/summary`, { signal });
    if (!res.ok) return;
    const data = (await res.json()) as {
      status: SummaryStatus;
      summary: SummaryPayload | null;
    };
    setStatus(data.status);
    setSummary(data.summary);
  }

  useEffect(() => {
    const controller = new AbortController();

    void fetchStatus(controller.signal);

    // Update elapsed timer for UI copy.
    elapsedTimer.current = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    // Poll for readiness for up to ~60s.
    pollTimer.current = window.setInterval(() => {
      void fetchStatus(controller.signal);
    }, 2500);

    return () => {
      controller.abort();
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      if (elapsedTimer.current) window.clearInterval(elapsedTimer.current);
    };
  }, [billId]);

  if (status === "ready" && summary) {
    const impact = parseImpactSections(summary.whyItMatters);
    const whyText = impact.why || summary.plainLanguage;
    const whoText = impact.who;

    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-navy">Plain-Language Summary</h2>
            <span className="tag bg-amber-100 text-xs text-amber-700">
              AI Generated
            </span>
          </div>
        </div>

        <p className="mb-6 leading-relaxed text-gray-700">
          {summary.plainLanguage}
        </p>

        {summary.keyProvisions.length > 0 && (
          <div>
            <h3 className="mb-3 font-semibold text-navy">Key Provisions</h3>
            <ul className="space-y-2">
              {summary.keyProvisions.map((provision, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-sm text-gray-700"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-civic-blue text-xs text-white">
                    {index + 1}
                  </span>
                  {provision}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-civic-gold/30 bg-civic-gold/10 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy">
              <span className="text-civic-gold">★</span> Why This Bill Matters
            </h3>
            <p className="text-sm leading-relaxed text-gray-700">{whyText}</p>
          </div>
          <div className="rounded-xl border border-civic-blue/30 bg-civic-blue/10 p-4">
            <h3 className="mb-2 font-semibold text-navy">Who This Bill Affects</h3>
            <p className="text-sm leading-relaxed text-gray-700">
              {whoText || "Affected groups are still being identified from the bill text."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-bold text-navy">Plain-Language Summary</h2>
          <span className="tag bg-gray-100 text-xs text-gray-600">
            Unavailable
          </span>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">
          We couldn&apos;t generate a plain-English summary for this bill right
          now. You can still read the official bill text below.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 bg-gradient-to-br from-blue-50 to-amber-50 rounded-2xl">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-navy">
        <Loader2 size={16} className="animate-spin" />
        Reading the bill…
      </div>
      <p className="text-xs text-gray-500 max-w-xs text-center">
        {`Waiting for background summary job (elapsed ${seconds}s).`}
      </p>
      <p className="text-[11px] text-gray-400 max-w-sm text-center">
        If this takes more than a minute, the background worker queue is likely
        delayed.
      </p>
    </div>
  );
}
