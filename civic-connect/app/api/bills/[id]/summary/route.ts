import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBillText } from "@/lib/congress";
import { preprocessBillText } from "@/lib/bill-text";
import { summarizeBill } from "@/lib/summarize";
import { withTimeout } from "@/lib/with-timeout";
import { isSummaryPlaceholder } from "@/lib/bill-summary";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const summary = await prisma.summary.findUnique({
    where: { billId: params.id },
    select: { plainLanguage: true, keyProvisions: true, whyItMatters: true },
  });

  if (summary) {
    const usable =
      !isSummaryPlaceholder(summary.plainLanguage) ||
      summary.keyProvisions.length > 0 ||
      !isSummaryPlaceholder(summary.whyItMatters);
    return NextResponse.json({
      status: usable ? "ready" : "unavailable",
      summary: usable ? summary : null,
    });
  }

  return NextResponse.json({ status: "pending", summary: null });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // If a summary exists already, return status immediately.
  const existing = await prisma.summary.findUnique({
    where: { billId: params.id },
    select: { plainLanguage: true, keyProvisions: true, whyItMatters: true },
  });
  if (existing) {
    const usable =
      !isSummaryPlaceholder(existing.plainLanguage) ||
      existing.keyProvisions.length > 0 ||
      !isSummaryPlaceholder(existing.whyItMatters);
    return NextResponse.json({
      status: usable ? "ready" : "unavailable",
      summary: usable ? existing : null,
    });
  }

  const bill = await prisma.bill.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, congress: true, type: true, number: true },
  });
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Try to generate within a bounded window. If this times out, client can poll.
  const didGenerate = await withTimeout(
    async () => {
      const textUrl = await withTimeout(
        () => fetchBillText(bill.congress, bill.type, bill.number),
        2_500,
        null
      );

      if (textUrl) {
        // Cache for later preview reads / retries (lightweight write).
        void prisma.bill.update({
          where: { id: bill.id },
          data: { fullTextUrl: textUrl },
        });
      }

      let billText = bill.title;
      if (textUrl) {
        const raw = await withTimeout(
          () =>
            fetch(textUrl, { next: { revalidate: 86_400 } }).then((res) =>
              res.ok ? res.text() : null
            ),
          6_000,
          null
        );
        if (raw) {
          billText = preprocessBillText(raw);
        }
      }

      const summary = await summarizeBill(bill.title, billText);
      await prisma.summary.upsert({
        where: { billId: bill.id },
        update: {
          plainLanguage: summary.plainLanguage,
          keyProvisions: summary.keyProvisions,
          whyItMatters: summary.whyItMatters,
          aiProvider: summary.aiProvider,
          aiModel: summary.aiModel,
        },
        create: {
          billId: bill.id,
          plainLanguage: summary.plainLanguage,
          keyProvisions: summary.keyProvisions,
          whyItMatters: summary.whyItMatters,
          aiProvider: summary.aiProvider,
          aiModel: summary.aiModel,
        },
      });
      return true;
    },
    15_000,
    false
  );

  if (!didGenerate) {
    return NextResponse.json({ status: "pending", summary: null }, { status: 202 });
  }

  const summary = await prisma.summary.findUnique({
    where: { billId: bill.id },
    select: { plainLanguage: true, keyProvisions: true, whyItMatters: true },
  });

  const usable =
    summary &&
    (!isSummaryPlaceholder(summary.plainLanguage) ||
      summary.keyProvisions.length > 0 ||
      !isSummaryPlaceholder(summary.whyItMatters));

  return NextResponse.json({
    status: usable ? "ready" : "unavailable",
    summary: usable ? summary : null,
  });
}

