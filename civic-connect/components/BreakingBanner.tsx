"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getSummaryPreview } from "@/lib/bill-summary";

interface BreakingBill {
  id: string;
  title: string;
  status: string;
  topic: string;
  summary: string | null;
  breakingAt: string;
  expiresAt: string;
  key: string;
}

const DISMISSED_BREAKING_KEY = "civicconnect-dismissed-breaking";
const POLL_INTERVAL_MS = 60 * 1000;

export default function BreakingBanner() {
  const [bill, setBill] = useState<BreakingBill | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    setDismissedKey(window.localStorage.getItem(DISMISSED_BREAKING_KEY));

    let isMounted = true;

    const loadBreakingBill = async () => {
      try {
        const response = await fetch("/api/bills/breaking", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { bill: BreakingBill | null };
        if (!isMounted) {
          return;
        }

        setBill(data.bill);
      } catch {}
    };

    loadBreakingBill();
    const poller = window.setInterval(loadBreakingBill, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(poller);
    };
  }, []);

  const hidden = useMemo(() => {
    if (!bill) {
      return true;
    }

    if (Date.now() >= new Date(bill.expiresAt).getTime()) {
      return true;
    }

    return dismissedKey === bill.key;
  }, [bill, dismissedKey]);

  if (!bill || hidden) {
    return null;
  }

  const minutesLeft = Math.max(
    1,
    Math.ceil((new Date(bill.expiresAt).getTime() - Date.now()) / 60000)
  );
  const summaryPreview = getSummaryPreview(bill.summary);

  return (
    <div
      className="sticky top-[53px] z-30 border-b border-[#5e1007]/15 bg-[#f9e2d8] text-[#5e1007]"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="shrink-0 border border-[#5e1007] bg-[#5e1007] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
          Breaking
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5e1007]/70">
            <span>{bill.topic} Desk</span>
            <span>{minutesLeft} min left</span>
          </div>
          <p className="mt-1 font-display text-2xl leading-tight text-[#2f0904]">
            <Link href={`/bill/${bill.id}`} className="hover:underline">
              {bill.title}
            </Link>
          </p>
          <p className="mt-1 text-sm leading-6 text-[#5e1007]/85">
            {bill.status}
          </p>
          {summaryPreview && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5e1007]/72">
              {summaryPreview}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={`/bill/${bill.id}`}
            className="hidden border border-[#5e1007]/20 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5e1007] transition-colors hover:border-[#5e1007] sm:inline-flex"
          >
            Read Bill
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(DISMISSED_BREAKING_KEY, bill.key);
              setDismissedKey(bill.key);
            }}
            className="inline-flex rounded-full border border-[#5e1007]/15 bg-white/70 p-2 text-[#5e1007] transition-colors hover:border-[#5e1007]"
            aria-label="Dismiss breaking bill banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
