"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-navy/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/squirrel-logo.png"
              alt="CivicConnect logo"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="font-display text-white text-xl font-bold tracking-tight">
              CivicConnect
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/bills" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Bills
            </Link>
            <Link href="/orgs" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Organizations
            </Link>
            <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              About
            </Link>
            <Link href="/bills" className="bg-civic-red text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-700 transition-colors">
              Explore Bills
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-white"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-navy border-t border-white/10 px-4 py-4 flex flex-col gap-4">
          <Link href="/bills" className="text-white/80 hover:text-white font-medium" onClick={() => setOpen(false)}>Bills</Link>
          <Link href="/orgs" className="text-white/80 hover:text-white font-medium" onClick={() => setOpen(false)}>Organizations</Link>
          <Link href="/about" className="text-white/80 hover:text-white font-medium" onClick={() => setOpen(false)}>About</Link>
        </div>
      )}
    </nav>
  );
}
