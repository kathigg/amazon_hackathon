"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

export default function BillLookup() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Normalize input to bill ID format
  // Accepts: "HR 1", "H.R. 1", "hr-1-119", "S. 42", etc.
  function normalize(input: string): string | null {
    const clean = input.trim().toUpperCase().replace(/\.\s*/g, "").replace(/\s+/g, "-");
    // Already in id format: hr-1-119
    if (/^[A-Z]+-\d+-\d+$/.test(clean)) return clean.toLowerCase();
    // Type + number only (no congress): HR-1 → hr-1-119
    if (/^[A-Z]+-\d+$/.test(clean)) return `${clean.toLowerCase()}-119`;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const billId = normalize(query);
    if (!billId) {
      // Fall back to keyword search on /bills
      router.push(`/bills?q=${encodeURIComponent(query)}`);
      return;
    }

    setLoading(true);
    try {
      // Hit the bill page — getBillOrFetch will create it if needed
      router.push(`/bill/${billId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "HR 1", "S 42", or "climate"'
          className="w-full pl-10 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="btn-primary text-sm flex items-center gap-2 justify-center disabled:opacity-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {loading ? "Loading…" : "Look Up Bill"}
      </button>
      {error && <p className="text-civic-red text-xs mt-1 w-full text-left">{error}</p>}
    </form>
  );
}
