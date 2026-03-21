"use client";
import { useState } from "react";
import { Flag } from "lucide-react";

export default function FeedbackButton({ billId }: { billId: string }) {
  const [state, setState] = useState<"idle" | "open" | "submitted">("idle");
  const [reason, setReason] = useState("");

  async function submit() {
    await fetch(`/api/bills/${billId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setState("submitted");
  }

  if (state === "submitted") {
    return <span className="text-xs text-green-600 font-medium">Thanks for your feedback</span>;
  }

  if (state === "open") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why does this seem biased?"
          className="text-xs border border-gray-300 rounded-full px-3 py-1 focus:outline-none focus:border-civic-blue"
        />
        <button
          onClick={submit}
          className="text-xs bg-civic-red text-white px-3 py-1 rounded-full hover:bg-red-700 transition-colors"
        >
          Submit
        </button>
        <button
          onClick={() => setState("idle")}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState("open")}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-civic-red transition-colors"
      aria-label="Flag this summary as biased"
    >
      <Flag size={12} />
      Flag as biased
    </button>
  );
}
