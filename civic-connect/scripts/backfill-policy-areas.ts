#!/usr/bin/env tsx
/**
 * Re-classify every bill in the DB against the active taxonomy (LoC Policy
 * Areas), strict single-label.
 *
 * Path per bill: Congress.gov `policyArea.name` → if missing, Bedrock single-
 * label LLM fallback → otherwise empty. See lib/taxonomy/classify.ts.
 *
 * Logs per-bill source so we can audit how many genuinely have no policy area.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { fetchBillDetail } from "../lib/congress";
import { classifyBillTaxonomy } from "../lib/taxonomy/classify";

async function main() {
  const bills = await prisma.bill.findMany({
    select: { id: true, congress: true, type: true, number: true, title: true },
    orderBy: { introducedAt: "desc" },
  });
  console.log(`Re-classifying ${bills.length} bills against LoC Policy Areas...\n`);

  const counts = { api: 0, "llm-fallback": 0, none: 0, error: 0 };

  for (const bill of bills) {
    try {
      const detail = await fetchBillDetail(bill.congress, bill.type, bill.number);
      const result = await classifyBillTaxonomy(detail, bill.title);
      await prisma.bill.update({
        where: { id: bill.id },
        data: { topicTags: result.topicTags, topicTagsSource: result.source },
      });
      counts[result.source]++;
      console.log(
        `  [${result.source.padEnd(13)}] ${bill.id.padEnd(20)} ${result.topicTags.join(", ") || "(empty)"}`
      );
      // Be nice to the Congress.gov API (1 req/sec advisory limit).
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      counts.error++;
      console.error(`  [error        ] ${bill.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nDone. Summary:");
  console.log(`  api           ${counts.api}`);
  console.log(`  llm-fallback  ${counts["llm-fallback"]}`);
  console.log(`  none          ${counts.none}`);
  console.log(`  error         ${counts.error}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
