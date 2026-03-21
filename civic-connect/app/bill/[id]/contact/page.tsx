"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Rep {
  name: string;
  party: string;
  office: string;
  photoUrl?: string;
  urls?: string[];
}

export default function ContactPage({ params }: { params: { id: string } }) {
  const [zip, setZip] = useState("");
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function lookup() {
    if (zip.length !== 5) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reps?zip=${zip}`);
      if (!res.ok) throw new Error("Could not find representatives.");
      const data = await res.json();
      setReps(data.reps ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href={`/bill/${params.id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Bill
      </Link>

      <h1 className="font-display text-3xl font-bold text-navy mb-2">Contact Your Representatives</h1>
      <p className="text-gray-500 mb-8">Enter your zip code to find your federal representatives and send them a message about this bill.</p>

      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Enter ZIP code"
          className="flex-1 px-4 py-3 rounded-full border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
          maxLength={5}
        />
        <button
          onClick={lookup}
          disabled={loading || zip.length !== 5}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Find Reps"}
        </button>
      </div>

      {error && <p className="text-civic-red text-sm mb-4">{error}</p>}

      {reps.length > 0 && (
        <div className="space-y-4">
          {reps.map((rep, i) => (
            <div key={i} className="card p-6 flex items-start gap-4">
              {rep.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={rep.photoUrl}
                  alt={rep.name}
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              )}
              <div className="flex-1">
                <h3 className="font-bold text-navy">{rep.name}</h3>
                <p className="text-sm text-gray-500">{rep.office} · {rep.party}</p>
                {rep.urls?.[0] && (
                  <a
                    href={rep.urls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 btn-primary text-xs px-4 py-2"
                  >
                    Contact via Official Website
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
