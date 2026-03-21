"use client";
import { useState } from "react";

export default function RsvpButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"idle" | "open" | "done">("idle");
  const [email, setEmail] = useState("");

  async function submit() {
    if (!email) return;
    await fetch(`/api/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setState("done");
  }

  if (state === "done") {
    return <span className="text-xs text-green-600 font-medium shrink-0">RSVP'd ✓</span>;
  }

  if (state === "open") {
    return (
      <div className="flex flex-col gap-1 shrink-0">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="text-xs border border-gray-300 rounded-full px-2 py-1 focus:outline-none focus:border-civic-blue w-36"
        />
        <div className="flex gap-1">
          <button
            onClick={submit}
            className="text-xs bg-civic-blue text-white px-2 py-1 rounded-full hover:bg-navy transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => setState("idle")}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState("open")}
      className="text-xs border border-civic-blue text-civic-blue px-3 py-1 rounded-full hover:bg-civic-blue hover:text-white transition-colors shrink-0"
    >
      RSVP
    </button>
  );
}
