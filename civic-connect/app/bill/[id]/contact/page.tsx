"use client";
import { useState } from "react";
import { ArrowLeft, Phone, Globe, Building2, Users } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface Rep {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  office: string;
  photoUrl?: string;
  websiteUrl?: string;
  phone?: string;
  officeAddress?: string;
}

const PARTY_COLORS: Record<string, string> = {
  Democratic: "bg-blue-100 text-blue-700 border border-blue-200",
  Republican: "bg-red-100 text-red-700 border border-red-200",
  Independent: "bg-purple-100 text-purple-700 border border-purple-200",
};

export default function ContactPage({ params }: { params: { id: string } }) {
  const [zip, setZip] = useState("");
  const [reps, setReps] = useState<Rep[]>([]);
  const [stateName, setStateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function lookup() {
    if (zip.length !== 5) return;
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const res = await fetch(`/api/reps?zip=${zip}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not find representatives.");
      setReps(data.reps ?? []);
      setStateName(data.stateName ?? "");
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const senators = reps.filter((r) => r.chamber === "Senate");
  const houseMembers = reps.filter((r) => r.chamber === "House of Representatives");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href={`/bill/${params.id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Bill
      </Link>

      <h1 className="font-display text-3xl font-bold text-navy mb-2">
        Contact Your Representatives
      </h1>
      <p className="text-gray-500 mb-8">
        Enter your ZIP code to find your U.S. Senators and House Representative, then reach out directly about this bill.
      </p>

      {/* ZIP input */}
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Enter ZIP code"
          className="flex-1 px-4 py-3 rounded-full border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
          maxLength={5}
        />
        <button
          onClick={lookup}
          disabled={loading || zip.length !== 5}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Looking up…" : "Find Reps"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-civic-red text-sm rounded-xl px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {searched && reps.length === 0 && !error && (
        <p className="text-gray-400 text-sm">No current members found for that ZIP code.</p>
      )}

      {reps.length > 0 && (
        <div className="space-y-8">
          {/* State header */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users size={16} />
            <span>Showing federal representatives for <span className="font-semibold text-navy">{stateName}</span></span>
          </div>

          {/* Senators */}
          {senators.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-bold text-navy mb-3">U.S. Senators</h2>
              <div className="space-y-4">
                {senators.map((rep) => (
                  <RepCard key={rep.bioguideId} rep={rep} />
                ))}
              </div>
            </section>
          )}

          {/* House */}
          {houseMembers.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-bold text-navy mb-3">U.S. House Members</h2>
              <div className="space-y-4">
                {houseMembers.map((rep) => (
                  <RepCard key={rep.bioguideId} rep={rep} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RepCard({ rep }: { rep: Rep }) {
  const partyColor =
    PARTY_COLORS[rep.party] ?? "bg-gray-100 text-gray-600 border border-gray-200";

  return (
    <div className="card p-6 flex items-start gap-5">
      {/* Photo */}
      <div className="shrink-0">
        {rep.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rep.photoUrl}
            alt={rep.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-100"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl font-bold">
            {rep.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-navy text-base">{rep.name}</h3>
          <span className={clsx("tag text-xs shrink-0", partyColor)}>{rep.party}</span>
        </div>
        <p className="text-sm text-gray-500 mb-3">{rep.office}</p>

        {/* Contact details */}
        <div className="space-y-1.5 mb-4">
          {rep.phone && (
            <a
              href={`tel:${rep.phone.replace(/\D/g, "")}`}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-navy transition-colors"
            >
              <Phone size={14} className="text-gray-400 shrink-0" />
              {rep.phone}
            </a>
          )}
          {rep.officeAddress && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Building2 size={14} className="text-gray-400 shrink-0" />
              {rep.officeAddress}
            </div>
          )}
        </div>

        {/* CTA */}
        {rep.websiteUrl && (
          <a
            href={rep.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 btn-primary text-xs px-4 py-2"
          >
            <Globe size={13} />
            Contact via Official Website
          </a>
        )}
      </div>
    </div>
  );
}
