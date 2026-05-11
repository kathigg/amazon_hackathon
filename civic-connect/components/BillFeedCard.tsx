"use client";

import Link from "next/link";
import BillIssueVisual from "@/components/BillIssueVisual";
import MilestonePill from "@/components/MilestonePill";
import RelativeTime from "@/components/RelativeTime";
import { getSummaryPreview } from "@/lib/bill-summary";
import { formatBillShortDate } from "@/lib/bill-dates";
import { formatTopicTag } from "@/lib/topics";
import type { ProgressStage } from "@/lib/bill-progress";

interface BillFeedCardProps {
  id: string;
  title: string;
  plainLanguage?: string;
  status: string;
  sponsor: string;
  topicTags: string[];
  imageUrl?: string | null;
  introducedAt: Date | string;
  latestActionAt?: Date | string | null;
  viewCount: number;
  isPersonalized?: boolean;
  progressStage?: ProgressStage | null;
  stageReachedAt?: Date | string | null;
  latestActionText?: string | null;
  billType?: string;
}

export default function BillFeedCard({
  id,
  title,
  plainLanguage,
  status,
  sponsor,
  topicTags,
  imageUrl,
  introducedAt,
  latestActionAt,
  viewCount,
  isPersonalized,
  progressStage,
  stageReachedAt,
  latestActionText,
  billType,
}: BillFeedCardProps) {
  const primaryTopic = topicTags[0] ? formatTopicTag(topicTags[0]) : "General";
  const summaryPreview = getSummaryPreview(plainLanguage);
  const stageDate = stageReachedAt ?? latestActionAt;
  const stageAbsolute = stageDate ? formatBillShortDate(stageDate) : null;
  const stageText = latestActionText || status;

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
            <span>
              Latest action:{" "}
              {formatBillShortDate(latestActionAt ?? introducedAt)}
            </span>
            <span>{viewCount.toLocaleString()} readers</span>
            {isPersonalized && <span className="text-civic-red">For You</span>}
            {progressStage && (
              <MilestonePill stage={progressStage} billType={billType} />
            )}
          </div>

          <h3 className="mt-3 font-display text-3xl leading-tight text-navy transition-colors group-hover:text-civic-blue">
            {title}
          </h3>

          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-navy/45">
            Sponsored by {sponsor}
          </p>

          {summaryPreview && (
            <p className="mt-4 max-w-3xl text-sm leading-7 text-navy/68 line-clamp-3">
              {summaryPreview}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {topicTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/60"
              >
                {formatTopicTag(tag)}
              </span>
            ))}
            {topicTags.length > 3 && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-navy/35">
                +{topicTags.length - 3} more
              </span>
            )}
          </div>

          {(stageText || stageAbsolute) && (
            <div className="mt-4 border border-black/10 bg-white px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy/45">
                Latest update
                {stageAbsolute && <span className="ml-2 text-navy/70">{stageAbsolute}</span>}
                <RelativeTime value={stageDate} className="ml-2 text-navy/45" />
              </div>
              {stageText && (
                <p className="mt-1 text-sm leading-snug text-navy/80">{stageText}</p>
              )}
            </div>
          )}
        </div>

        <div className="order-first md:order-none">
          <BillIssueVisual
            billId={id}
            title={title}
            topicLabel={primaryTopic}
            topicTags={topicTags}
            imageUrl={imageUrl}
            className="h-44 w-full border border-black/10 bg-white md:h-36"
          />
        </div>
      </div>
    </Link>
  );
}
