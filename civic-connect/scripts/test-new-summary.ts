/**
 * One-off comparison: regenerate a single bill's summary using the production
 * summarizeBill() and print old vs. new side-by-side. Also verifies the
 * splitWhyAndWho() parser finds both sections.
 *
 * Does NOT write to the database. Set TEST_BILL_ID env var to override the
 * default bill (hr-237-119, Paws Off Act).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { fetchBillText } from "../lib/congress";
import { preprocessBillText } from "../lib/bill-text";
import { summarizeBill } from "../lib/summarize";
import { splitParagraphs, splitWhyAndWho } from "../lib/bill-summary";

const prisma = new PrismaClient();

const wc = (s: string) => (s?.trim() ? s.trim().split(/\s+/).length : 0);

async function main() {
  const billId = process.env.TEST_BILL_ID || "hr-237-119";
  console.log(`\n=== Testing production summarizeBill() on ${billId} ===\n`);

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { summary: true },
  });
  if (!bill) {
    console.error(`Bill ${billId} not found in DB`);
    process.exit(1);
  }

  console.log(`Title: ${bill.title}`);
  console.log(`Type/Number: ${bill.type} ${bill.number} (Congress ${bill.congress})\n`);

  console.log("Fetching bill text...");
  const textUrl = await fetchBillText(bill.congress, bill.type, bill.number);
  let billText = bill.title;
  if (textUrl) {
    const textRes = await fetch(textUrl);
    if (textRes.ok) {
      billText = preprocessBillText(await textRes.text());
      console.log(`  fetched ${billText.length} chars from ${textUrl}\n`);
    }
  }

  console.log("============================================================");
  console.log("OLD SUMMARY (from DB)");
  console.log("============================================================");
  if (!bill.summary) {
    console.log("(no existing summary)");
  } else {
    console.log(`Model: ${bill.summary.aiModel ?? "(none)"}`);
    console.log(`[plainLanguage] ${wc(bill.summary.plainLanguage)} words`);
    console.log(bill.summary.plainLanguage);
    console.log(`\n[keyProvisions] ${bill.summary.keyProvisions.length} bullets`);
    bill.summary.keyProvisions.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log(`\n[whyItMatters] ${wc(bill.summary.whyItMatters)} words`);
    console.log(bill.summary.whyItMatters || "(empty)");
  }

  console.log("\n============================================================");
  console.log("NEW SUMMARY (production lib/summarize.ts)");
  console.log("============================================================");
  const t0 = Date.now();
  const newSummary = await summarizeBill(bill.title, billText);
  const elapsed = Date.now() - t0;
  console.log(`Model: ${newSummary.aiModel}`);
  console.log(`Elapsed: ${elapsed}ms\n`);

  const paragraphs = splitParagraphs(newSummary.plainLanguage);
  console.log(`[plainLanguage] ${wc(newSummary.plainLanguage)} words / ${paragraphs.length} paragraph(s)`);
  paragraphs.forEach((p, i) => {
    console.log(`\n  ¶${i + 1} (${wc(p)} words):`);
    console.log("  " + p.replace(/\n/g, "\n  "));
  });

  console.log(`\n[keyProvisions] ${newSummary.keyProvisions.length} bullets`);
  newSummary.keyProvisions.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  console.log(`\n[whyItMatters raw] ${wc(newSummary.whyItMatters)} words`);
  console.log(newSummary.whyItMatters);

  const { why, who } = splitWhyAndWho(newSummary.whyItMatters);
  console.log("\n--- splitWhyAndWho() result ---");
  console.log(`why  (${wc(why)} words): ${why.slice(0, 120)}…`);
  console.log(`who  (${who ? wc(who) + " words" : "NULL — delimiter not found, would fall back to one box"}): ${who ? who.slice(0, 120) + "…" : ""}`);

  console.log("\n============================================================");
  console.log("CHECKS");
  console.log("============================================================");
  console.log(`paragraphs in plainLanguage: ${paragraphs.length} (target: 3) ${paragraphs.length === 3 ? "✓" : "✗"}`);
  console.log(`who section parsed: ${who !== null ? "✓" : "✗ (will render as one box)"}`);
  console.log(`plainLanguage word count: ${wc(newSummary.plainLanguage)} (target: 250-350) ${wc(newSummary.plainLanguage) >= 200 ? "✓" : "✗"}`);
}

main()
  .catch((e) => {
    console.error("\nERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
