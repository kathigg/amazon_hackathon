"use client";

import { useEffect } from "react";
import {
  HOME_SEEN_BILLS_COOKIE,
  mergeSeenBillIds,
  parseSeenBillIds,
} from "@/lib/home-feed-history";

interface HomeFeedMemoryProps {
  billIds: string[];
}

export default function HomeFeedMemory({ billIds }: HomeFeedMemoryProps) {
  const billIdsKey = billIds.join(",");

  useEffect(() => {
    if (!billIdsKey) {
      return;
    }

    const visibleBillIds = billIdsKey.split(",");
    const currentValue = getCookieValue(HOME_SEEN_BILLS_COOKIE);
    const mergedBillIds = mergeSeenBillIds(
      parseSeenBillIds(currentValue),
      visibleBillIds
    );

    document.cookie = `${HOME_SEEN_BILLS_COOKIE}=${encodeURIComponent(
      mergedBillIds.join(",")
    )}; Path=/; Max-Age=2592000; SameSite=Lax`;
  }, [billIdsKey]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}

function getCookieValue(name: string): string | null {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? cookie.slice(prefix.length) : null;
}
