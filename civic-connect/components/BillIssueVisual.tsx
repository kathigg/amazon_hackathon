"use client";

import clsx from "clsx";
import { getBillImageRecord } from "@/lib/bill-image-categories";

interface BillIssueVisualProps {
  billId: string;
  title: string;
  topicLabel?: string | null;
  topicTags: string[];
  imageUrl?: string | null;
  className?: string;
  preferFull?: boolean;
}

export default function BillIssueVisual({
  billId,
  title,
  topicLabel,
  topicTags,
  imageUrl,
  className,
  preferFull = false,
}: BillIssueVisualProps) {
  const topicImage = getBillImageRecord(billId, topicTags).imageUrl;
  const imagePath = isTrustedStoredImage(imageUrl) ? imageUrl : topicImage;
  const label = topicLabel?.trim() || "Policy graphic";
  const capsule = preferFull ? "px-3 py-1.5 text-[10px]" : "px-2.5 py-1 text-[9px]";

  return (
    <div
      aria-label={`${label} graphic for ${title}`}
      className={clsx(
        "relative isolate overflow-hidden rounded-[24px] border border-gray-200 bg-white",
        className
      )}
    >
      <img
        src={imagePath}
        alt={`${label} graphic`}
        loading="lazy"
        decoding="async"
        onError={(event) => {
          const target = event.currentTarget;
          if (target.src.includes("/bill-placeholder.svg")) return;
          target.src = "/bill-placeholder.svg";
        }}
        className="h-full w-full object-cover"
      />

      <div
        className={clsx(
          "absolute left-4 top-4 inline-flex rounded-full bg-white/90 font-semibold uppercase tracking-[0.18em] text-navy/75 shadow-sm backdrop-blur",
          capsule
        )}
      >
        {label}
      </div>
    </div>
  );
}

function isTrustedStoredImage(imageUrl?: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  if (imageUrl.startsWith("/topic-images/")) {
    return true;
  }

  if (imageUrl.startsWith("/curated-images/")) {
    return true;
  }

  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname.endsWith(".cloudfront.net") ||
      url.hostname.endsWith(".amazonaws.com")
    );
  } catch {
    return false;
  }
}
