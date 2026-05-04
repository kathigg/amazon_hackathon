#!/usr/bin/env tsx
/**
 * Opt-in batch upgrade: run LLM tag enrichment on every bill whose
 * `topicTagsSource` is anything other than "llm" (covers null/legacy bills,
 * api-only, keyword-only, none). The API anchor is preserved; up to 2
 * additional LoC labels may be added per bill.
 *
 * Run with: npm run enrich:tags
 *
 * Cost: ~1 Bedrock Haiku call per bill, throttled at 250ms between calls to
 * stay polite. Logs source per bill (llm/error/skipped).
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { classifyBillFromTitle } from "../lib/taxonomy/classify-bill-llm";
import { parseTerm } from "../lib/taxonomy";

async function main() {
  const bills = await prisma.bill.findMany({
    where: { OR: [{ topicTagsSource: { not: "llm" } }, { topicTagsSource: null }] },
    select: { id: true, title: true, topicTags: true, topicTagsSource: true },
    orderBy: { introducedAt: "desc" },
  });
  console.log(`Enriching ${bills.length} bills with LLM tag suggestions...\n`);

  const counts = { llm: 0, skipped: 0, error: 0 };

  for (const bill of bills) {
    try {
      const apiAnchor = parseTerm(bill.topicTags[0] ?? "")?.value ?? null;
      const result = await classifyBillFromTitle({ title: bill.title, apiAnchor });

      if (result.source !== "llm" || result.topicTags.length === 0) {
        counts.skipped++;
        console.log(`  [skipped] ${bill.id.padEnd(20)} (${result.source})`);
      } else {
        await prisma.bill.update({
          where: { id: bill.id },
          data: { topicTags: result.topicTags, topicTagsSource: "llm" },
        });
        counts.llm++;
        console.log(
          `  [llm    ] ${bill.id.padEnd(20)} ${result.topicTags
            .map((t) => parseTerm(t)?.value ?? t)
            .join(", ")}`
        );
      }

      // Throttle: avoid Bedrock rate-limit and DB pressure.
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      counts.error++;
      console.error(
        `  [error  ] ${bill.id}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log("\nDone. Summary:");
  console.log(`  llm      ${counts.llm}`);
  console.log(`  skipped  ${counts.skipped}`);
  console.log(`  error    ${counts.error}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
