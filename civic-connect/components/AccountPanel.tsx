"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LogOut, MapPin, Mail, Star } from "lucide-react";
import {
  ACCOUNT_INTERESTS,
  sanitizeInterestSelections,
  type AccountInterestSelection,
} from "@/lib/account-interests";
import {
  DEFAULT_EMAIL_SUBSCRIPTIONS,
  EMAIL_SUBSCRIPTION_OPTIONS,
  getInitialEmailSubscriptions,
  sanitizeEmailSubscriptions,
  type EmailSubscription,
} from "@/lib/email-preferences";

interface AccountPanelProps {
  currentEmail: string | null;
  initialSelections: string[];
  initialSubscriptions: string[];
  initialTimezone: string | null;
  initialZipCode: string;
  initialPreferredRepBioguideIds: string[];
}

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

type PendingAction = "save" | "login" | "logout" | "lookup" | null;

export default function AccountPanel({
  currentEmail,
  initialSelections,
  initialSubscriptions,
  initialTimezone,
  initialZipCode,
  initialPreferredRepBioguideIds,
}: AccountPanelProps) {
  const router = useRouter();
  const hasAccount = Boolean(currentEmail);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [loginEmail, setLoginEmail] = useState("");
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [timezone, setTimezone] = useState(initialTimezone ?? "America/New_York");
  const [selectedInterests, setSelectedInterests] =
    useState<AccountInterestSelection[]>(
      sanitizeInterestSelections(initialSelections)
    );
  const [subscriptions, setSubscriptions] = useState<EmailSubscription[]>(
    getInitialEmailSubscriptions(initialSubscriptions)
  );
  const [reps, setReps] = useState<RepOption[]>([]);
  const [stateName, setStateName] = useState("");
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>(
    initialPreferredRepBioguideIds
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isRefreshing, startTransition] = useTransition();

  const isBusy = pendingAction !== null || isRefreshing;

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) {
      setTimezone(browserTimeZone);
    }
  }, []);

  useEffect(() => {
    if (initialZipCode.length === 5) {
      void lookupRepresentatives();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialZipCode]);

  function toggleInterest(interestId: AccountInterestSelection) {
    setSelectedInterests((current) =>
      current.includes(interestId)
        ? current.filter((value) => value !== interestId)
        : [...current, interestId]
    );
  }

  function toggleSubscription(subscriptionId: EmailSubscription) {
    setSubscriptions((current) => {
      const next = current.includes(subscriptionId)
        ? current.filter((value) => value !== subscriptionId)
        : [...current, subscriptionId];

      return sanitizeEmailSubscriptions(next);
    });
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

      setReps(data.reps ?? []);
      setStateName(data.stateName ?? "");
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

  async function submitRequest(
    path: string,
    body: Record<string, unknown> | undefined,
    action: Exclude<PendingAction, null>,
    fallbackError: string,
    onSuccess?: () => void
  ) {
    setError("");
    setSuccessMessage("");
    setPendingAction(action);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? fallbackError);
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAccountSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (selectedInterests.length === 0) {
      setError("Pick at least one issue before continuing.");
      return;
    }

    await submitRequest(
      "/api/account",
      {
        email,
        interestSelections: selectedInterests,
        emailSubscriptions: subscriptions,
        timezone,
        zipCode,
        preferredRepBioguideIds: selectedRepIds,
      },
      "save",
      "Failed to save your account.",
      () => {
        if (hasAccount) {
          setSuccessMessage("Your desk has been updated.");
          startTransition(() => {
            router.refresh();
          });
          return;
        }

        router.push("/bills?personalized=true");
        router.refresh();
      }
    );
  }

  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    await submitRequest(
      "/api/account/login",
      {
        email: loginEmail,
      },
      "login",
      "Failed to log you in.",
      () => {
        router.push("/bills?personalized=true");
        router.refresh();
      }
    );
  }

  async function handleLogout() {
    await submitRequest(
      "/api/account/logout",
      undefined,
      "logout",
      "Failed to log you out.",
      () => {
        router.push("/account");
        router.refresh();
      }
    );
  }

  const selectedRepCount = selectedRepIds.length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_360px]">
      <div className="border border-black/10 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              {hasAccount ? "Saved Account" : "Create Account"}
            </p>
            <h2 className="mt-3 font-display text-4xl leading-none text-navy">
              {hasAccount ? currentEmail : "Set up your desk in under a minute"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-navy/68">
              {hasAccount
                ? "Update your issue priorities, email schedule, and home-state representatives whenever you want."
                : "Add your email, pick your issue beats, choose how often you want briefings, and tell us which senators or House members should appear first."}
            </p>
          </div>

          {hasAccount && (
            <span className="inline-flex shrink-0 items-center border border-black/10 bg-[#f6f1e7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/60">
              Signed In
            </span>
          )}
        </div>

        <form onSubmit={handleAccountSubmit} className="mt-6 space-y-8">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-3 w-full border border-black/15 bg-[#fcfaf6] px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
              disabled={isBusy}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                Pick Your Issues
              </label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                {selectedInterests.length} selected
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              Choose at least one. These selections shape your personalized bill desk immediately.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ACCOUNT_INTERESTS.map((interest) => {
                const isSelected = selectedInterests.includes(interest.id);

                return (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => toggleInterest(interest.id)}
                    disabled={isBusy}
                    className={`border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-navy bg-navy text-white"
                        : "border-black/10 bg-[#fcfaf6] text-navy hover:border-navy"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">
                        {interest.label}
                      </span>
                      {isSelected && <Check size={16} className="shrink-0" />}
                    </div>
                    <p
                      className={`mt-3 text-sm leading-6 ${
                        isSelected ? "text-white/82" : "text-navy/65"
                      }`}
                    >
                      {interest.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-navy/50" />
              <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                Email Schedule
              </label>
            </div>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              Weekly is on by default. The next-morning briefing goes out at 9am in your local time zone after sign-up.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EMAIL_SUBSCRIPTION_OPTIONS.map((option) => {
                const checked = subscriptions.includes(option.id);

                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer flex-col gap-2 border p-4 transition-colors ${
                      checked
                        ? "border-navy bg-navy/4"
                        : "border-black/10 bg-[#fcfaf6]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-navy">
                        {option.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSubscription(option.id)}
                        className="h-4 w-4 accent-navy"
                        disabled={isBusy}
                      />
                    </div>
                    <p className="text-sm leading-6 text-navy/65">{option.blurb}</p>
                  </label>
                );
              })}
            </div>
            {subscriptions.length === 0 && (
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-navy/45">
                No email briefings selected.
              </p>
            )}
          </div>

          <div className="border border-black/10 bg-[#fcfaf6] p-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-navy/50" />
              <label className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/55">
                Your Senators And House Member
              </label>
            </div>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              Enter your ZIP code and star the members you want to surface first on each bill.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                value={zipCode}
                onChange={(e) =>
                  setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                placeholder="ZIP code"
                className="w-full border border-black/15 bg-white px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={lookupRepresentatives}
                disabled={isBusy || zipCode.length !== 5}
                className="border border-navy bg-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/60"
              >
                {pendingAction === "lookup" ? "Finding..." : "Find Reps"}
              </button>
            </div>

            {stateName && (
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-navy/45">
                {stateName} delegation · {selectedRepCount} selected
              </p>
            )}

            {reps.length > 0 && (
              <div className="mt-4 grid gap-3">
                {reps.map((rep) => {
                  const selected = selectedRepIds.includes(rep.bioguideId);

                  return (
                    <button
                      key={rep.bioguideId}
                      type="button"
                      onClick={() => togglePreferredRep(rep.bioguideId)}
                      className={`flex items-start justify-between gap-4 border p-4 text-left transition-colors ${
                        selected
                          ? "border-navy bg-navy text-white"
                          : "border-black/10 bg-white text-navy hover:border-navy"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{rep.name}</p>
                        <p
                          className={`mt-1 text-xs uppercase tracking-[0.18em] ${
                            selected ? "text-white/70" : "text-navy/45"
                          }`}
                        >
                          {rep.party} · {rep.office}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                        <Star className="h-4 w-4" fill={selected ? "currentColor" : "none"} />
                        {selected ? "Saved" : "Star Rep"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <input type="hidden" name="timezone" value={timezone} />

          {error && (
            <p className="border border-civic-red/20 bg-civic-red/5 px-4 py-3 text-sm text-civic-red">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="border border-green-600/15 bg-green-600/5 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isBusy}
              className="border border-navy bg-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/60"
            >
              {pendingAction === "save"
                ? hasAccount
                  ? "Saving..."
                  : "Creating..."
                : hasAccount
                  ? "Save Desk"
                  : "Create Account"}
            </button>

            <Link
              href="/bills?personalized=true"
              className="inline-flex items-center gap-2 border border-black/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy"
            >
              Open Your Desk
              <ArrowRight size={14} />
            </Link>
          </div>
        </form>
      </div>

      <div className="space-y-6">
        {!hasAccount ? (
          <div className="border border-black/10 bg-white p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              Returning Readers
            </p>
            <h3 className="mt-3 font-display text-3xl leading-none text-navy">
              Log back in with your email
            </h3>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              Enter the same email and we&apos;ll restore your account on this browser, including your issue picks and saved representatives.
            </p>

            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              <input
                required
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-black/15 bg-[#fcfaf6] px-4 py-3 text-sm text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
                disabled={isBusy}
              />
              <button
                type="submit"
                disabled={isBusy}
                className="w-full border border-black/10 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:text-navy/40"
              >
                {pendingAction === "login" ? "Logging In..." : "Log In"}
              </button>
            </form>
          </div>
        ) : (
          <div className="border border-black/10 bg-white p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              Reader Access
            </p>
            <h3 className="mt-3 font-display text-3xl leading-none text-navy">
              Signed in as {currentEmail}
            </h3>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              Your account stays attached to this browser until you log out.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isBusy}
              className="mt-6 inline-flex items-center gap-2 border border-black/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:text-navy/45"
            >
              <LogOut size={14} />
              {pendingAction === "logout" ? "Logging Out..." : "Log Out"}
            </button>
          </div>
        )}

        <div className="border border-black/10 bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
            What You&apos;ll Get
          </p>
          <div className="mt-4 space-y-4 text-sm leading-7 text-navy/68">
            <p>
              Daily and weekly briefs pull together up to twelve bills, the organizations tied to them, and the representatives most relevant to where each bill currently sits.
            </p>
            <p>
              Starred senators and House members show up first on bill pages so you can see their likely position faster.
            </p>
            <p>
              After sign-up, your next morning briefing lands at 9am in your time zone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
