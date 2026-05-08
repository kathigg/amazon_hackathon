#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { fetchBillText } from "../lib/congress";
import { preprocessBillText } from "../lib/bill-text";
import { isSummaryPlaceholder, splitParagraphs, splitWhyAndWho } from "../lib/bill-summary";
import { summarizeBill } from "../lib/summarize";

const DEFAULT_LIMIT = 12;
const LIMIT = Number(process.env.SUMMARY_BACKFILL_LIMIT ?? DEFAULT_LIMIT);
const FORCE = process.env.SUMMARY_BACKFILL_FORCE === "true";

async function main() {
  const candidates = await prisma.bill.findMany({
    take: Math.max(LIMIT * 3, LIMIT),
    orderBy: [{ introducedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    include: { summary: true },
  });

  const bills = candidates
    .filter((bill) => FORCE || !isModernSummary(bill.summary))
    .slice(0, LIMIT);

  console.log(`Backfilling ${bills.length} stale summaries with ${process.env.AWS_BEDROCK_MODEL ?? "amazon.nova-lite-v1:0"}...\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const bill of bills) {
    try {
      const textUrl = await fetchBillText(bill.congress, bill.type, bill.number);
      if (!textUrl) {
        skipped += 1;
        console.log(`[skipped ] ${bill.id.padEnd(18)} no bill text URL`);
        continue;
      }

      const response = await fetch(textUrl, { cache: "no-store" });
      if (!response.ok) {
        skipped += 1;
        console.log(`[skipped ] ${bill.id.padEnd(18)} text fetch ${response.status}`);
        continue;
      }

      const billText = preprocessBillText(await response.text());
      if (!billText) {
        skipped += 1;
        console.log(`[skipped ] ${bill.id.padEnd(18)} empty parsed text`);
        continue;
      }

      const summary = await summarizeBill(bill.title, billText);
      if (isSummaryPlaceholder(summary.plainLanguage)) {
        failed += 1;
        console.log(`[failed  ] ${bill.id.padEnd(18)} summary unavailable`);
        continue;
      }

      await prisma.summary.upsert({
        where: { billId: bill.id },
        update: {
          plainLanguage: summary.plainLanguage,
          keyProvisions: summary.keyProvisions,
          whyItMatters: summary.whyItMatters,
          aiProvider: summary.aiProvider,
          aiModel: summary.aiModel,
          generatedAt: new Date(),
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

      updated += 1;
      console.log(`[updated ] ${bill.id.padEnd(18)} ${summary.aiModel}`);
    } catch (error) {
      failed += 1;
      console.error(
        `[error   ] ${bill.id.padEnd(18)} ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log("\nDone.");
  console.log(`  updated ${updated}`);
  console.log(`  skipped ${skipped}`);
  console.log(`  failed  ${failed}`);
}

function isModernSummary(
  summary: {
    plainLanguage: string;
    whyItMatters: string;
    aiModel: string | null;
  } | null
) {
  if (!summary || isSummaryPlaceholder(summary.plainLanguage)) {
    return false;
  }

  const paragraphs = splitParagraphs(summary.plainLanguage);
  const { why, who } = splitWhyAndWho(summary.whyItMatters ?? "");
  return (
    paragraphs.length >= 3 &&
    why.length > 120 &&
    Boolean(who && who.length > 120) &&
    (summary.aiModel ?? "").includes("nova-lite")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
