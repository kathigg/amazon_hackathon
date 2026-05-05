"use client";
import { useEffect, useRef } from "react";

interface BillViewTrackerProps {
  billId: string;
  topics: string[];
}

export default function BillViewTracker({ billId, topics }: BillViewTrackerProps) {
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    const sessionKey = `civic-bill-view:${billId}`;

    if (window.sessionStorage.getItem(sessionKey) === "sent") {
      return;
    }

    // Track scroll depth
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const scrollPercent = Math.round(
        ((scrollTop + windowHeight) / documentHeight) * 100
      );
      maxScroll.current = Math.max(maxScroll.current, scrollPercent);
    };

    window.addEventListener("scroll", handleScroll);

    const sendTrackingData = () => {
      if (sent.current) {
        return;
      }

      sent.current = true;
      window.sessionStorage.setItem(sessionKey, "sent");

      const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
      const payload = JSON.stringify({
        billId,
        topics,
        timeSpent,
        scrollDepth: maxScroll.current,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/analytics/bill-view",
          new Blob([payload], { type: "application/json" })
        );
        return;
      }

      fetch("/api/analytics/bill-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendTrackingData();
      }
    };

    window.addEventListener("pagehide", sendTrackingData);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", sendTrackingData);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sendTrackingData();
    };
  }, [billId, topics]);

  return null;
}
