/**
 * One-time backfill: assign every Bill an imageAssetId from the BillImageAsset pool.
 *
 * Iterates Bill in batches, runs assignBillImageAsset which:
 *   - tries each loc-subject/<subject> key from Bill.legislativeSubjects first
 *   - falls back to loc-area/<policyArea> keys from Bill.topicTags
 *   - leaves imageAssetId null if nothing matches
 *
 * Safe to re-run: every call overwrites Bill.imageAssetId with the deterministic pick.
 *
 * Usage:
 *   npm run backfill:bill-images
 *   npm run backfill:bill-images -- --only hr-1234-119
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { assignBillImageAsset } from "../lib/image-pool";

interface CliOptions {
  only: string | null;
  batchSize: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { only: null, batchSize: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--only") opts.only = argv[++i];
    else if (arg === "--batch-size") opts.batchSize = Number(argv[++i]);
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const totalAssets = await prisma.billImageAsset.count({
    where: { retiredAt: null },
  });
  if (totalAssets === 0) {
    console.error(
      "BillImageAsset pool is empty. Run `npm run curate:images` before backfilling."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Pool size: ${totalAssets} live assets`);

  let cursor: string | undefined;
  let processed = 0;
  let assigned = 0;
  let skipped = 0;

  while (true) {
    const where = opts.only ? { id: opts.only } : undefined;
    const bills = await prisma.bill.findMany({
      where,
      take: opts.batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        topicTags: true,
        legislativeSubjects: true,
      },
    });

    if (bills.length === 0) break;

    for (const bill of bills) {
      const subjects =
        (bill as unknown as { legislativeSubjects?: string[] })
          .legislativeSubjects ?? [];
      const result = await assignBillImageAsset(bill.id, bill.topicTags, subjects);
      processed += 1;
      if (result) assigned += 1;
      else skipped += 1;
    }

    cursor = bills[bills.length - 1]?.id;
    if (opts.only) break;
    if (bills.length < opts.batchSize) break;
  }

  console.log(`Done. processed=${processed} assigned=${assigned} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
