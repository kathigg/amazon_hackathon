import AccountPanel from "@/components/AccountPanel";
import { getCurrentUser } from "@/lib/user-tracking";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const currentUser = await getCurrentUser().catch(() => null);

  return (
    <div className="min-h-screen">
      <section className="border-b border-black/10">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-civic-red">
            Reader Account
          </p>
          <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-navy sm:text-6xl">
            {currentUser?.email
              ? "Your desk is saved."
              : "Create a quick account and pick your policy beats."}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-navy/70 sm:text-base">
            Add your email, choose at least one issue, and CivicConnect will keep
            your desk pinned to the topics you care about. For this prototype,
            entering your email is enough to sign back in later.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <AccountPanel
          currentEmail={currentUser?.email ?? null}
          initialSelections={currentUser?.interestSelections ?? []}
          initialSubscriptions={currentUser?.emailSubscriptions ?? ["weekly"]}
          initialTimezone={currentUser?.timezone ?? null}
          initialZipCode={currentUser?.zipCode ?? ""}
          initialPreferredRepBioguideIds={currentUser?.preferredRepBioguideIds ?? []}
        />
      </section>
    </div>
  );
}
