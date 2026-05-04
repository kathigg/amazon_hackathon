"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveTaxonomy } from "@/lib/taxonomy";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

export default function RegisterOrgPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    mission: "",
    website: "",
    location: "",
    topicTags: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleTag(tag: string) {
    setForm((f) => ({
      ...f,
      topicTags: f.topicTags.includes(tag)
        ? f.topicTags.filter((t) => t !== tag)
        : [...f.topicTags, tag],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Registration failed.");
      router.push("/orgs");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link href="/orgs" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to Organizations
      </Link>

      <h1 className="font-display text-3xl font-bold text-navy mb-2">Register Your Organization</h1>
      <p className="text-gray-500 mb-8">List your org so citizens can find you and attend your events.</p>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div>
          <label className="block text-sm font-semibold text-navy mb-1">Organization Name *</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy mb-1">Mission Statement *</label>
          <textarea
            required
            rows={3}
            value={form.mission}
            onChange={(e) => setForm({ ...form, mission: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy mb-1">Website</label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy mb-1">Location</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="City, State or National"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-civic-blue focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy mb-3">Issue Areas</label>
          <div className="space-y-4">
            {ACTIVE_TAXONOMY.groups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 mb-2">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.terms.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`tag px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        form.topicTags.includes(tag)
                          ? "bg-navy text-white border-navy"
                          : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-civic-red text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {loading ? "Registering…" : "Register Organization"}
        </button>
      </form>
    </div>
  );
}
