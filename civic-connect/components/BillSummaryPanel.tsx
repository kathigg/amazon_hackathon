"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type SummaryPayload = {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
};

type SummaryStatus = "pending" | "ready" | "unavailable";

export default function BillSummaryPanel({ billId }: { billId: string }) {
  const [status, setStatus] = useState<SummaryStatus>("pending");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [attempted, setAttempted] = useState(false);
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

  async function triggerGeneration(signal?: AbortSignal) {
    const res = await fetch(`/api/bills/${billId}/summary`, {
      method: "POST",
      signal,
    });
    // 200 (ready/unavailable) or 202 (pending)
    if (!res.ok) return;
    const data = (await res.json()) as {
      status: SummaryStatus;
      summary: SummaryPayload | null;
    };
    setAttempted(true);
    setStatus(data.status);
    setSummary(data.summary);
  }

  useEffect(() => {
    const controller = new AbortController();

    // 1) Load current status fast.
    void fetchStatus(controller.signal).then(() => {
      // 2) If still pending, kick off generation once.
      void triggerGeneration(controller.signal);
    });

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

        <div className="mt-6 rounded-xl border border-civic-gold/30 bg-civic-gold/10 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy">
            <span className="text-civic-gold">★</span> Why It Matters And Who It
            Affects
          </h3>
          <p className="text-sm leading-relaxed text-gray-700">
            {summary.whyItMatters || summary.plainLanguage}
          </p>
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
        {attempted
          ? `Generating the plain-English summary (elapsed ${seconds}s).`
          : "Preparing summary generation…"}
      </p>
      <p className="text-[11px] text-gray-400 max-w-sm text-center">
        If this takes more than a minute, the AI service or Congress.gov text
        endpoint is likely slow.
      </p>
    </div>
  );
}

