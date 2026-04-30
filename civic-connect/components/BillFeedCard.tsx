"use client";

import Link from "next/link";
import BillIssueVisual from "@/components/BillIssueVisual";

interface BillFeedCardProps {
  id: string;
  title: string;
  plainLanguage?: string;
  status: string;
  sponsor: string;
  topicTags: string[];
  introducedAt: Date;
  viewCount: number;
  isPersonalized?: boolean;
  imageThumbnailUrl?: string | null;
  imageUrl?: string | null;
  imageTitle?: string | null;
  imageCreator?: string | null;
  imageLicense?: string | null;
  imageLicenseVersion?: string | null;
}

export default function BillFeedCard({
  id,
  title,
  plainLanguage,
  status,
  sponsor,
  topicTags,
  introducedAt,
  viewCount,
  isPersonalized,
  imageThumbnailUrl,
  imageUrl,
  imageTitle,
  imageCreator,
  imageLicense,
  imageLicenseVersion,
}: BillFeedCardProps) {
  const timeAgo = getTimeAgo(introducedAt);
  const primaryTopic = topicTags[0] ?? "General";

  return (
    <Link
      href={`/bill/${id}`}
      className="group block border-b border-black/10 py-6 transition-colors"
    >
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
            <span>{primaryTopic}</span>
            <span>{id.toUpperCase()}</span>
            <span>{timeAgo}</span>
            <span>{viewCount.toLocaleString()} readers</span>
            {isPersonalized && <span className="text-civic-red">For You</span>}
          </div>

          <h3 className="mt-3 font-display text-3xl leading-tight text-navy transition-colors group-hover:text-civic-blue">
            {title}
          </h3>

          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-navy/45">
            Sponsored by {sponsor}
          </p>

          {plainLanguage && (
            <p className="mt-4 max-w-3xl text-sm leading-7 text-navy/68 line-clamp-3">
              {plainLanguage}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {topicTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/60"
              >
                {tag}
              </span>
            ))}
            {topicTags.length > 3 && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/35">
                +{topicTags.length - 3} more
              </span>
            )}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/60">
            <span className="h-2 w-2 rounded-full bg-green-600" />
            {status}
          </div>
        </div>

        <div className="order-first md:order-none">
          <BillIssueVisual
            billId={id}
            title={title}
            imageThumbnailUrl={imageThumbnailUrl}
            imageUrl={imageUrl}
            imageTitle={imageTitle}
            imageCreator={imageCreator}
            imageLicense={imageLicense}
            imageLicenseVersion={imageLicenseVersion}
            className="h-44 w-full border border-black/10 bg-white md:h-36"
          />
        </div>
      </div>
    </Link>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
