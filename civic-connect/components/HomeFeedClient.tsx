"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BillFeedCard from "@/components/BillFeedCard";
import BillIssueVisual from "@/components/BillIssueVisual";
import { getSummaryPreview } from "@/lib/bill-summary";
import { formatBillDate, formatBillShortDate } from "@/lib/bill-dates";
import { formatTopicTag } from "@/lib/topics";

type FeedBill = {
  id: string;
  title: string;
  sponsor: string;
  status: string;
  introducedAt: string;
  topicTags: string[];
  imageUrl: string | null;
  viewCount: number;
  summary: { plainLanguage: string } | null;
};

type HomeFeedResponse = {
  latestBills: FeedBill[];
  hotBills: FeedBill[];
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
          cache: "no-store",
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
  const hotBills = data?.hotBills ?? [];
  const leadBill = latestBills[0];
  const latestFeed = latestBills.slice(0, 6);
  const hotRail = hotBills.slice(0, 3);
  const leadSummary = getSummaryPreview(leadBill?.summary?.plainLanguage);

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
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-navy/45">
                  <span>{leadBill.id.toUpperCase()}</span>
                  <span>{formatBillDate(leadBill.introducedAt)}</span>
                  <span>{leadBill.viewCount.toLocaleString()} readers</span>
                </div>
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
                Trending Now
              </p>
              <div className="mt-4 space-y-4">
                {hotRail.map((bill, index) => (
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
                      {formatBillShortDate(bill.introducedAt)} ·{" "}
                      {bill.viewCount.toLocaleString()} readers
                    </p>
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
              title={bill.title}
              plainLanguage={bill.summary?.plainLanguage}
              status={bill.status}
              sponsor={bill.sponsor}
              topicTags={bill.topicTags}
              imageUrl={bill.imageUrl}
              introducedAt={bill.introducedAt}
              viewCount={bill.viewCount}
            />
          ))}
        </div>
      </section>
    </>
  );
}

