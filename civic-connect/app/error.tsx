"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-start justify-center px-4 py-16 text-navy sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
        CivicConnect
      </p>
      <h1 className="mt-3 font-display text-5xl leading-none">
        The page hit a client error.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-navy/68">
        The app recovered into a safe fallback instead of crashing the whole
        page. Try loading this screen again or head back to the bills desk.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="border border-navy bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
        >
          Retry
        </button>
        <Link
          href="/bills"
          className="border border-black/10 bg-[#fcfaf6] px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
        >
          Go To Bills
        </Link>
      </div>
    </div>
  );
}
