"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BillFeedCard from "@/components/BillFeedCard";
import BillIssueVisual from "@/components/BillIssueVisual";
import MilestonePill from "@/components/MilestonePill";
import { getSummaryPreview } from "@/lib/bill-summary";
import {
  formatBillDate,
  formatBillShortDate,
  formatRelativeBillTime,
} from "@/lib/bill-dates";
import { formatTopicTag } from "@/lib/topics";
import type { ProgressStage } from "@/lib/bill-progress";

type FeedBill = {
  id: string;
  type: string;
  title: string;
  sponsor: string;
  status: string;
  introducedAt: string;
  latestActionAt: string | null;
  progressStage: ProgressStage | null;
  stageReachedAt: string | null;
  latestActionText: string | null;
  topicTags: string[];
  imageUrl: string | null;
  viewCount: number;
  summary: { plainLanguage: string } | null;
};

type HomeFeedResponse = {
  latestBills: FeedBill[];
  recentBills: FeedBill[];
};

export default function HomeFeedClient() {
  const [data, setData] = useState<HomeFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/home-feed", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as HomeFeedResponse;
        if (!cancelled) {
          setData(payload);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="space-y-4 border-t border-black/10 pt-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded bg-white" />
          ))}
        </div>
      </section>
    );
  }

  const latestBills = data?.latestBills ?? [];
  const recentBills = data?.recentBills ?? [];
  const leadBill = latestBills[0];
  const latestFeed = latestBills.slice(0, 6);
  const recentRail = recentBills.slice(0, 3);
  const leadSummary = getSummaryPreview(leadBill?.summary?.plainLanguage);
  const leadStageDate = leadBill?.stageReachedAt ?? leadBill?.latestActionAt;
  const leadStageRelative = formatRelativeBillTime(leadStageDate ?? null);
  const leadStageAbsolute = leadStageDate ? formatBillShortDate(leadStageDate) : null;
  const leadStageText = leadBill?.latestActionText || leadBill?.status;

  if (!leadBill) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-display text-5xl text-navy">No bills loaded yet</h1>
        <p className="mt-4 text-base text-navy/70">
          Open the bills desk and fetch a bill to populate the homepage feed.
        </p>
        <Link
          href="/bills"
          className="mt-6 inline-flex border border-navy px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy"
        >
          Open Bills Desk
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="border-b border-black/10">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1.5fr)_320px]">
            <article>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-civic-red">
                Latest Bill
              </p>
              <Link href={`/bill/${leadBill.id}`} className="group block">
                <h1 className="mt-4 font-display text-5xl leading-[0.95] text-navy transition-colors group-hover:text-civic-blue sm:text-6xl">
                  {leadBill.title}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-8 text-navy/72">
                  {leadSummary ??
                    "Read the latest plain-language analysis, party positions, and action steps for this federal bill."}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                  <span>{leadBill.id.toUpperCase()}</span>
                  <span>Introduced: {formatBillDate(leadBill.introducedAt)}</span>
                  {leadBill.latestActionAt && (
                    <span>Latest action: {formatBillDate(leadBill.latestActionAt)}</span>
                  )}
                  {leadBill.progressStage && (
                    <MilestonePill
                      stage={leadBill.progressStage}
                      billType={leadBill.type}
                    />
                  )}
                </div>
                {(leadStageText || leadStageAbsolute) && (
                  <div className="mt-4 max-w-3xl border border-black/10 bg-white px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy/45">
                      Latest update
                      {leadStageAbsolute && (
                        <span className="ml-2 text-navy/70">{leadStageAbsolute}</span>
                      )}
                      {leadStageRelative && (
                        <span className="ml-2 text-navy/45">({leadStageRelative})</span>
                      )}
                    </div>
                    {leadStageText && (
                      <p className="mt-1 text-sm leading-snug text-navy/80">{leadStageText}</p>
                    )}
                  </div>
                )}
                <div className="mt-8 overflow-hidden border border-black/10 bg-white">
                  <BillIssueVisual
                    billId={leadBill.id}
                    title={leadBill.title}
                    topicLabel={
                      leadBill.topicTags[0]
                        ? formatTopicTag(leadBill.topicTags[0])
                        : "General"
                    }
                    topicTags={leadBill.topicTags}
                    imageUrl={leadBill.imageUrl}
                    className="h-72 w-full"
                    preferFull
                  />
                </div>
              </Link>
            </article>

            <aside>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
                More Recent Bills
              </p>
              <div className="mt-4 space-y-4">
                {recentRail.map((bill, index) => (
                  <Link
                    key={bill.id}
                    href={`/bill/${bill.id}`}
                    className="block border-t border-black/10 pt-4 transition-colors hover:text-civic-blue"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-navy/45">
                      {index + 1 < 10 ? `0${index + 1}` : index + 1} ·{" "}
                      {bill.topicTags[0] ? formatTopicTag(bill.topicTags[0]) : "General"}
                    </p>
                    <h2 className="mt-2 font-display text-2xl leading-tight text-navy">
                      {bill.title}
                    </h2>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-navy/45">
                      Latest action:{" "}
                      {formatBillShortDate(bill.latestActionAt ?? bill.introducedAt)}
                    </p>
                    {bill.progressStage && (
                      <div className="mt-2">
                        <MilestonePill stage={bill.progressStage} billType={bill.type} />
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 border-b border-black/10 pb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/45">
              Latest
            </p>
            <h2 className="mt-2 font-display text-4xl text-navy">
              Newly introduced bills
            </h2>
          </div>
          <Link
            href="/bills"
            className="shrink-0 border border-black/10 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-navy transition-colors hover:border-navy"
          >
            View All Bills
          </Link>
        </div>

        <div className="mt-2 border-t border-black/10">
          {latestFeed.map((bill) => (
            <BillFeedCard
              key={bill.id}
              id={bill.id}
              billType={bill.type}
              title={bill.title}
              plainLanguage={bill.summary?.plainLanguage}
              status={bill.status}
              sponsor={bill.sponsor}
              topicTags={bill.topicTags}
              imageUrl={bill.imageUrl}
              introducedAt={bill.introducedAt}
              latestActionAt={bill.latestActionAt}
              progressStage={bill.progressStage}
              stageReachedAt={bill.stageReachedAt}
              latestActionText={bill.latestActionText}
              viewCount={bill.viewCount}
            />
          ))}
        </div>
      </section>
    </>
  );
}
