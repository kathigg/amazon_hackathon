"use client";
import { useEffect, useRef } from "react";

interface BillViewTrackerProps {
  billId: string;
  topics: string[];
}

export default function BillViewTracker({ billId, topics }: BillViewTrackerProps) {
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);

  useEffect(() => {
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

    // Send tracking data when user leaves
    const sendTrackingData = async () => {
      const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
      
      await fetch("/api/analytics/bill-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billId,
          topics,
          timeSpent,
          scrollDepth: maxScroll.current,
        }),
      });
    };

    // Track on page unload
    const handleBeforeUnload = () => {
      sendTrackingData();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Also track every 30 seconds (in case user keeps tab open)
    const interval = setInterval(sendTrackingData, 30000);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(interval);
      sendTrackingData();
    };
  }, [billId, topics]);

  return null;
}
