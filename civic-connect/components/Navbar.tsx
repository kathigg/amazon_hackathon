"use client";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useState } from "react";
import { Menu, X } from "lucide-react";
import BillCategoryBar from "@/components/BillCategoryBar";
import BreakingBanner from "@/components/BreakingBanner";

interface NavbarProps {
  accountEmail?: string | null;
}

export default function Navbar({ accountEmail }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const accountLabel = accountEmail ? "My Account" : "Create Account";

  return (
    <header className="border-b border-black/10 bg-[#f6f1e7] text-navy">
      <div className="border-b border-black/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-navy/55 sm:px-6 lg:px-8">
          <span>Coverage of the 119th Congress</span>
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
              <Image
                src="/squirrel-logo.png"
                alt="CivicConnect logo"
                width={36}
                height={36}
                className="rounded-sm border border-black/10 bg-white p-1"
              />
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
              The CivicConnect Record
            </span>
            <span className="block font-display text-[2.65rem] leading-none text-navy sm:text-[3.6rem]">
              CivicConnect
            </span>
          </Link>

          <div className="hidden items-center justify-end gap-6 md:flex">
            <Link href="/" className="text-sm font-medium text-navy/75 transition-colors hover:text-navy">
              Home
            </Link>
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
            <Link href="/" className="text-sm font-medium text-navy/80" onClick={() => setOpen(false)}>
              Home
            </Link>
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

      <Suspense fallback={null}>
        <BillCategoryBar />
      </Suspense>
      <BreakingBanner />
    </header>
  );
}
