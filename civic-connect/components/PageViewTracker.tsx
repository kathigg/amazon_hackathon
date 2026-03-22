"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function PageViewTracker({ billId }: { billId?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, billId }),
    }).catch(() => {}); // fire-and-forget, never block the UI
  }, [pathname, billId]);

  return null;
}
