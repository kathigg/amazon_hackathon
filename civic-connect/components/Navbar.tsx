"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Menu, X } from "lucide-react";
import BillCategoryBar from "@/components/BillCategoryBar";
import BreakingBanner from "@/components/BreakingBanner";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import CivicConnectMark from "@/components/CivicConnectMark";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const accountLabel = "Account";

  return (
    <header className="border-b border-black/10 bg-[#f6f1e7] text-navy">
      <div className="border-b border-black/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-navy/55 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Coverage of the 119th Congress
          </span>
          <div className="hidden items-center gap-6 md:flex">
            <Link href="/bills" className="hover:text-navy">
              Latest Bills
            </Link>
            <Link href="/orgs" className="hover:text-navy">
              Civic Groups
            </Link>
            <Link href="/about" className="hover:text-navy">
              Methodology
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 p-2 text-navy md:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link href="/bills" className="hidden items-center gap-3 md:flex">
              <CivicConnectMark className="h-10 w-10" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-navy/50">
                  Congress Desk
                </p>
                <p className="text-sm font-semibold text-navy">Latest legislation, decoded</p>
              </div>
            </Link>
          </div>

          <Link href="/" className="justify-self-center text-center">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.38em] text-navy/45">
              Latest legislation, decoded.
            </span>
            <span className="block font-display text-[2.65rem] leading-none text-navy sm:text-[3.6rem]">
              CivicConnect
            </span>
          </Link>

          <div className="hidden items-center justify-end gap-6 md:flex">
            <Link href="/bills" className="text-sm font-medium text-navy/75 transition-colors hover:text-navy">
              Bills
            </Link>
            <Link href="/orgs" className="text-sm font-medium text-navy/75 transition-colors hover:text-navy">
              Organizations
            </Link>
            <Link href="/about" className="text-sm font-medium text-navy/75 transition-colors hover:text-navy">
              About
            </Link>
            <Link
              href="/account"
              className="border border-black/10 bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-navy transition-colors hover:border-navy"
            >
              {accountLabel}
            </Link>
          </div>
        </div>

        {open && (
          <div className="mt-4 flex flex-col gap-3 border-t border-black/10 pt-4 md:hidden">
            <Link href="/bills" className="text-sm font-medium text-navy/80" onClick={() => setOpen(false)}>
              Bills
            </Link>
            <Link href="/orgs" className="text-sm font-medium text-navy/80" onClick={() => setOpen(false)}>
              Organizations
            </Link>
            <Link href="/about" className="text-sm font-medium text-navy/80" onClick={() => setOpen(false)}>
              About
            </Link>
            <Link href="/account" className="text-sm font-medium text-navy/80" onClick={() => setOpen(false)}>
              {accountLabel}
            </Link>
          </div>
        )}
      </div>

      <ClientErrorBoundary>
        <Suspense fallback={null}>
          <BillCategoryBar />
        </Suspense>
      </ClientErrorBoundary>
      <ClientErrorBoundary>
        <BreakingBanner />
      </ClientErrorBoundary>
    </header>
  );
}
