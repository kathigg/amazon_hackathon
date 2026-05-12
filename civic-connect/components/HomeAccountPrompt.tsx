"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, MapPin, Star, X } from "lucide-react";
import {
  ACCOUNT_INTERESTS,
  sanitizeInterestSelections,
  type AccountInterestSelection,
} from "@/lib/account-interests";
import { DEFAULT_EMAIL_SUBSCRIPTIONS } from "@/lib/email-preferences";

const STORAGE_KEY = "civic-home-account-prompt-v1";
const PROMPT_DELAY_MS = 900;
const PROMPT_INTERESTS = ACCOUNT_INTERESTS.slice(0, 6);

interface RepOption {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  office: string;
  photoUrl?: string;
  websiteUrl?: string;
  phone?: string;
}

type PendingAction = "lookup" | "save" | null;

export default function HomeAccountPrompt() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [selectedInterests, setSelectedInterests] = useState<
    AccountInterestSelection[]
  >([]);
  const [reps, setReps] = useState<RepOption[]>([]);
  const [stateName, setStateName] = useState("");
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isNavigating, startTransition] = useTransition();

  const isBusy = pendingAction !== null || isNavigating;

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) {
      setTimezone(browserTimeZone);
    }

    if (getPromptState()) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismiss();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  function dismiss() {
    setPromptState("dismissed");
    setIsVisible(false);
  }

  function complete() {
    setPromptState("created");
    setIsVisible(false);
  }

  function toggleInterest(interestId: AccountInterestSelection) {
    setSelectedInterests((current) =>
      current.includes(interestId)
        ? current.filter((value) => value !== interestId)
        : sanitizeInterestSelections([...current, interestId])
    );
  }

  function togglePreferredRep(repId: string) {
    setSelectedRepIds((current) =>
      current.includes(repId)
        ? current.filter((value) => value !== repId)
        : [...current, repId].slice(0, 6)
    );
  }

  async function lookupRepresentatives() {
    if (zipCode.length !== 5) {
      setError("Enter a valid 5-digit ZIP code first.");
      return;
    }

    setError("");
    setPendingAction("lookup");

    try {
      const response = await fetch(`/api/reps?zip=${zipCode}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to look up representatives.");
      }

      const nextReps = data?.reps ?? [];
      setReps(nextReps);
      setStateName(data?.stateName ?? "");
      setSelectedRepIds(
        nextReps.slice(0, 3).map((rep: RepOption) => rep.bioguideId)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to look up representatives."
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedInterests.length === 0) {
      setError("Pick at least one issue to shape your desk.");
      return;
    }

    if (selectedRepIds.length === 0) {
      setError("Look up your ZIP code and select at least one representative.");
      return;
    }

    setError("");
    setPendingAction("save");

    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          interestSelections: selectedInterests,
          emailSubscriptions: DEFAULT_EMAIL_SUBSCRIPTIONS,
          timezone,
          zipCode,
          preferredRepBioguideIds: selectedRepIds,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create your account.");
      }

      complete();
      startTransition(() => {
        router.push("/bills?personalized=true");
        router.refresh();
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create your account."
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          dismiss();
        }
      }}
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="home-account-prompt-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-black/10 bg-[#fcfaf6] shadow-2xl"
      >
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative overflow-hidden bg-navy p-6 text-white sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-civic-red" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
              Make it local
            </p>
            <h2
              id="home-account-prompt-title"
              className="mt-4 font-display text-4xl leading-none sm:text-5xl"
            >
              Follow the bills your representatives can act on.
            </h2>
            <p className="mt-5 text-sm leading-7 text-white/72">
              Enter your ZIP code, select the members you want to track, and
              create a reader account so your desk opens around your delegation.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-white/78">
              <div className="border border-white/15 p-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  01
                </span>
                <p className="mt-2">Find your senators and House member.</p>
              </div>
              <div className="border border-white/15 p-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  02
                </span>
                <p className="mt-2">Star the representatives to surface first.</p>
              </div>
              <div className="border border-white/15 p-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  03
                </span>
                <p className="mt-2">Save your account and open a personalized desk.</p>
              </div>
            </div>
          </div>

          <div className="relative p-6 sm:p-8">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close account prompt"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center border border-black/10 bg-white text-navy transition-colors hover:border-navy"
            >
              <X className="h-4 w-4" />
            </button>

            <form onSubmit={createAccount} className="space-y-6 pr-0 sm:pr-8">
              <div>
                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-3 w-full border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
                  disabled={isBusy}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                  <MapPin className="h-4 w-4" />
                  Your representatives
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={zipCode}
                    onChange={(event) =>
                      setZipCode(event.target.value.replace(/\D/g, "").slice(0, 5))
                    }
                    placeholder="ZIP code"
                    className="w-full border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
                    disabled={isBusy}
                  />
                  <button
                    type="button"
                    onClick={lookupRepresentatives}
                    disabled={isBusy || zipCode.length !== 5}
                    className="shrink-0 border border-navy bg-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition-colors hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/55"
                  >
                    {pendingAction === "lookup" ? "Finding..." : "Find Reps"}
                  </button>
                </div>

                {stateName && (
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-navy/45">
                    {stateName} delegation · {selectedRepIds.length} selected
                  </p>
                )}

                {reps.length > 0 && (
                  <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto pr-1">
                    {reps.map((rep) => {
                      const selected = selectedRepIds.includes(rep.bioguideId);

                      return (
                        <button
                          key={rep.bioguideId}
                          type="button"
                          onClick={() => togglePreferredRep(rep.bioguideId)}
                          className={`flex items-start justify-between gap-4 border p-3 text-left transition-colors ${
                            selected
                              ? "border-navy bg-navy text-white"
                              : "border-black/10 bg-white text-navy hover:border-navy"
                          }`}
                          disabled={isBusy}
                        >
                          <span>
                            <span className="block text-sm font-semibold">
                              {rep.name}
                            </span>
                            <span
                              className={`mt-1 block text-[11px] uppercase tracking-[0.18em] ${
                                selected ? "text-white/70" : "text-navy/45"
                              }`}
                            >
                              {rep.party} · {rep.office}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                            <Star
                              className="h-4 w-4"
                              fill={selected ? "currentColor" : "none"}
                            />
                            {selected ? "Selected" : "Select"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                    First policy focus
                  </label>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/40">
                    {selectedInterests.length} selected
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PROMPT_INTERESTS.map((interest) => {
                    const selected = selectedInterests.includes(interest.id);

                    return (
                      <button
                        key={interest.id}
                        type="button"
                        onClick={() => toggleInterest(interest.id)}
                        disabled={isBusy}
                        className={`flex items-center justify-between gap-3 border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                          selected
                            ? "border-navy bg-navy text-white"
                            : "border-black/10 bg-white text-navy hover:border-navy"
                        }`}
                      >
                        {interest.label}
                        {selected && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p className="border border-civic-red/20 bg-civic-red/5 px-4 py-3 text-sm text-civic-red">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={isBusy}
                  className="border border-navy bg-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition-colors hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/55"
                >
                  {pendingAction === "save" ? "Creating..." : "Create Account"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="border border-black/10 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-navy transition-colors hover:border-navy"
                >
                  Not Now
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function getPromptState() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setPromptState(value: "dismissed" | "created") {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // If storage is unavailable, closing the in-memory modal is still enough.
  }
}
