"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Phone, Globe, Building2, Users, Star } from "lucide-react";
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
  const [preferredRepIds, setPreferredRepIds] = useState<string[]>([]);
  const [savingRepId, setSavingRepId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/account/preferences");
        const data = await response.json().catch(() => null);
        if (!response.ok || !isMounted) {
          return;
        }

        setPreferredRepIds(data.preferredRepBioguideIds ?? []);
        if (data.zipCode) {
          setZip(data.zipCode);
        }
      } catch {}
    };

    loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

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

  async function togglePreferredRep(repId: string) {
    const next = preferredRepIds.includes(repId)
      ? preferredRepIds.filter((value) => value !== repId)
      : [...preferredRepIds, repId].slice(0, 6);

    setSavingRepId(repId);
    setPreferredRepIds(next);

    try {
      const response = await fetch("/api/account/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zipCode: zip,
          preferredRepBioguideIds: next,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.error ?? "Could not save your representative preferences."
        );
      }
    } catch (err) {
      setPreferredRepIds((current) =>
        current.includes(repId)
          ? current.filter((value) => value !== repId)
          : [...current, repId].slice(0, 6)
      );
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your representative preferences."
      );
    } finally {
      setSavingRepId(null);
    }
  }

  const senators = reps.filter((r) => r.chamber === "Senate");
  const houseMembers = reps.filter((r) => r.chamber === "House of Representatives");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href={`/bill/${params.id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Bill
      </Link>

      <h1 className="font-display text-3xl font-bold text-navy mb-2">
        Contact Your Representatives
      </h1>
      <p className="text-gray-500 mb-8">
        Enter your ZIP code to find your senators and House member. Star them here and they&apos;ll surface first on bill pages.
      </p>

      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Enter ZIP code"
          className="flex-1 border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
          maxLength={5}
        />
        <button
          onClick={lookup}
          disabled={loading || zip.length !== 5}
          className="border border-navy bg-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/60"
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
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users size={16} />
            <span>
              Showing federal representatives for{" "}
              <span className="font-semibold text-navy">{stateName}</span>
            </span>
          </div>

          {senators.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-bold text-navy mb-3">U.S. Senators</h2>
              <div className="space-y-4">
                {senators.map((rep) => (
                  <RepCard
                    key={rep.bioguideId}
                    rep={rep}
                    preferred={preferredRepIds.includes(rep.bioguideId)}
                    saving={savingRepId === rep.bioguideId}
                    onTogglePreferred={() => togglePreferredRep(rep.bioguideId)}
                  />
                ))}
              </div>
            </section>
          )}

          {houseMembers.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-bold text-navy mb-3">U.S. House Member</h2>
              <div className="space-y-4">
                {houseMembers.map((rep) => (
                  <RepCard
                    key={rep.bioguideId}
                    rep={rep}
                    preferred={preferredRepIds.includes(rep.bioguideId)}
                    saving={savingRepId === rep.bioguideId}
                    onTogglePreferred={() => togglePreferredRep(rep.bioguideId)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RepCard({
  rep,
  preferred,
  saving,
  onTogglePreferred,
}: {
  rep: Rep;
  preferred: boolean;
  saving: boolean;
  onTogglePreferred: () => void;
}) {
  const partyColor =
    PARTY_COLORS[rep.party] ?? "bg-gray-100 text-gray-600 border border-gray-200";

  return (
    <div
      className={clsx(
        "card p-6 flex items-start gap-5",
        preferred && "border-navy bg-navy text-white"
      )}
    >
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

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className={clsx("font-bold text-base", preferred ? "text-white" : "text-navy")}>
              {rep.name}
            </h3>
            <p className={clsx("text-sm mt-1", preferred ? "text-white/70" : "text-gray-500")}>
              {rep.office}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx("tag text-xs shrink-0", preferred ? "bg-white/15 text-white border-white/10" : partyColor)}>
              {rep.party}
            </span>
            <button
              type="button"
              onClick={onTogglePreferred}
              className={clsx(
                "inline-flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]",
                preferred
                  ? "border-white/20 text-white bg-white/10"
                  : "border-black/10 text-navy bg-white"
              )}
            >
              <Star className="h-3.5 w-3.5" fill={preferred ? "currentColor" : "none"} />
              {saving ? "Saving..." : preferred ? "Your Rep" : "That’s My Rep"}
            </button>
          </div>
        </div>

        <div className="space-y-1.5 mb-4">
          {rep.phone && (
            <a
              href={`tel:${rep.phone.replace(/\D/g, "")}`}
              className={clsx(
                "flex items-center gap-2 text-sm transition-colors",
                preferred ? "text-white/80 hover:text-white" : "text-gray-600 hover:text-navy"
              )}
            >
              <Phone size={14} className={clsx("shrink-0", preferred ? "text-white/60" : "text-gray-400")} />
              {rep.phone}
            </a>
          )}
          {rep.officeAddress && (
            <div className={clsx("flex items-center gap-2 text-sm", preferred ? "text-white/72" : "text-gray-500")}>
              <Building2 size={14} className={clsx("shrink-0", preferred ? "text-white/60" : "text-gray-400")} />
              {rep.officeAddress}
            </div>
          )}
        </div>

        {rep.websiteUrl && (
          <a
            href={rep.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "inline-flex items-center gap-2 text-xs px-4 py-2 font-semibold uppercase tracking-[0.18em]",
              preferred ? "bg-white text-navy" : "border border-black/10 bg-white text-navy"
            )}
          >
            <Globe size={13} />
            Contact via Official Website
          </a>
        )}
      </div>
    </div>
  );
}
