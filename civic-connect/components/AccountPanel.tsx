"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, LogOut } from "lucide-react";
import {
  ACCOUNT_INTERESTS,
  sanitizeInterestSelections,
  type AccountInterestSelection,
} from "@/lib/account-interests";

interface AccountPanelProps {
  currentEmail: string | null;
  initialSelections: string[];
}

type PendingAction = "save" | "login" | "logout" | null;

export default function AccountPanel({
  currentEmail,
  initialSelections,
}: AccountPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail ?? "");
  const [loginEmail, setLoginEmail] = useState("");
  const [selectedInterests, setSelectedInterests] =
    useState<AccountInterestSelection[]>(
      sanitizeInterestSelections(initialSelections)
    );
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isRefreshing, startTransition] = useTransition();

  const hasAccount = Boolean(currentEmail);
  const isBusy = pendingAction !== null || isRefreshing;

  function toggleInterest(interestId: AccountInterestSelection) {
    setSelectedInterests((current) =>
      current.includes(interestId)
        ? current.filter((value) => value !== interestId)
        : [...current, interestId]
    );
  }

  async function submitRequest(
    path: string,
    body: Record<string, unknown> | undefined,
    action: Exclude<PendingAction, null>,
    fallbackError: string
  ) {
    setError("");
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

      startTransition(() => {
        router.refresh();
      });
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
      },
      "save",
      "Failed to save your account."
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
      "Failed to log you in."
    );
  }

  async function handleLogout() {
    await submitRequest(
      "/api/account/logout",
      undefined,
      "logout",
      "Failed to log you out."
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_360px]">
      <div className="border border-black/10 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              {hasAccount ? "Saved Account" : "Create Account"}
            </p>
            <h2 className="mt-3 font-display text-4xl leading-none text-navy">
              {hasAccount ? currentEmail : "Save your desk in under a minute"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-navy/68">
              {hasAccount
                ? "Update your issue picks at any time. Your explicit interests now seed the For You feed immediately."
                : "Enter your email, pick the policy areas you want to follow, and keep that setup on this browser across visits."}
            </p>
          </div>

          {hasAccount && (
            <span className="inline-flex shrink-0 items-center border border-black/10 bg-[#f6f1e7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/60">
              Signed In
            </span>
          )}
        </div>

        <form onSubmit={handleAccountSubmit} className="mt-6 space-y-6">
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
              Choose at least one. These selections work like a quick editorial
              desk setup and immediately shape your recommendations.
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

          {error && (
            <p className="border border-civic-red/20 bg-civic-red/5 px-4 py-3 text-sm text-civic-red">
              {error}
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
                  ? "Save Interests"
                  : "Create Account"}
            </button>

            {hasAccount && (
              <Link
                href="/bills?personalized=true"
                className="inline-flex items-center gap-2 border border-black/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy"
              >
                Open Your Desk
                <ArrowRight size={14} />
              </Link>
            )}
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
              No password or verification step in this prototype. Enter the same
              email and we&apos;ll restore that account on this browser.
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
                className="w-full border border-black/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:text-navy/45"
              >
                {pendingAction === "login" ? "Logging In..." : "Log In"}
              </button>
            </form>
          </div>
        ) : (
          <div className="border border-black/10 bg-white p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              Session
            </p>
            <h3 className="mt-3 font-display text-3xl leading-none text-navy">
              Stay signed in on this browser
            </h3>
            <p className="mt-3 text-sm leading-7 text-navy/68">
              The account cookie is persistent, so the same browser should keep
              your desk saved until you sign out or clear cookies.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isBusy}
              className="mt-6 inline-flex items-center gap-2 border border-black/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:text-navy/45"
            >
              <LogOut size={14} />
              {pendingAction === "logout" ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        )}

        <div className="border border-black/10 bg-white/80 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
            What Gets Saved
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-navy/68">
            <p>Your email is the only sign-in field in this prototype.</p>
            <p>Your issue picks seed the recommendations engine immediately.</p>
            <p>Your reading history can still keep shaping the feed afterward.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
