"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { parseBillId } from "@/lib/bill-id";

export default function BillLookup() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = query.trim();
    if (!trimmed) return;

    const ids = parseBillId(trimmed);
    setLoading(true);
    try {
      if (ids.length === 1) {
        router.push(`/bill/${ids[0]}`);
      } else {
        router.push(`/bills?q=${encodeURIComponent(trimmed)}`);
      }
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
