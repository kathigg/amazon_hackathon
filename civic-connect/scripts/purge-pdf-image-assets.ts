/**
 * Purge PDF-derived BillImageAsset rows + their S3 objects.
 *
 * Wikimedia Commons returns JPEG thumbnails of PDFs (Internet Archive book
 * scans, GPO Congressional hearings) that look like images at download time
 * but are off-topic covers, not subject imagery. ~30% of the curated pool fell
 * into this bucket. We identify them by sourceUrl ending in .pdf — the
 * Wikimedia descriptionurl (landing page) retains the .pdf extension even
 * when the rendered thumbnail is a .jpg.
 *
 * The schema's Bill.imageAssetId relation defaults to ON DELETE RESTRICT, so
 * we null out referencing bills inside the same transaction as the delete.
 * S3 cleanup runs after the DB commits — failures there only leak storage,
 * not consistency.
 *
 * Usage:
 *   npm run purge:pdf-images               # dry-run
 *   npm run purge:pdf-images -- --apply    # hard delete (DB + S3)
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

import { prisma } from "../lib/prisma";
import { getStorage } from "./lib/storage";

interface CliFlags {
  apply: boolean;
  skipS3: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { apply: false, skipS3: false };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--skip-s3") flags.skipS3 = true;
  }
  return flags;
}

interface AssetRow {
  id: string;
  categoryKey: string;
  storageKey: string;
  sourceUrl: string | null;
  originalUrl: string | null;
  title: string | null;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const storageNote = flags.skipS3 ? "DB only, skip storage" : "DB + storage";
  console.log(`Mode: ${flags.apply ? `APPLY (${storageNote})` : "DRY-RUN"}`);

  // Use raw SQL because Prisma doesn't expose case-insensitive ILIKE on
  // optional string fields cleanly via the typed client.
  const assets: AssetRow[] = await prisma.$queryRaw`
    SELECT id, "categoryKey", "storageKey", "sourceUrl", "originalUrl", title
    FROM "BillImageAsset"
    WHERE "sourceUrl" ILIKE '%.pdf%' OR "originalUrl" ILIKE '%.pdf%'
    ORDER BY "categoryKey", id
  `;
  console.log(`PDF-derived candidates: ${assets.length}`);

  if (assets.length === 0) {
    console.log("Nothing to purge.");
    return;
  }

  // Bills referencing these assets — they need imageAssetId nulled before delete.
  const assetIds = assets.map((a) => a.id);
  const referencingBills = await prisma.bill.findMany({
    where: { imageAssetId: { in: assetIds } },
    select: { id: true, imageAssetId: true },
  });
  console.log(`Bills referencing these assets: ${referencingBills.length}`);

  const byCategory = new Map<string, number>();
  for (const a of assets) {
    byCategory.set(a.categoryKey, (byCategory.get(a.categoryKey) ?? 0) + 1);
  }
  console.log("\nPer-category PDF count:");
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  for (const [key, n] of sorted) console.log(`  ${n.toString().padStart(4)} ${key}`);

  console.log("\nSample rows (first 5):");
  for (const a of assets.slice(0, 5)) {
    console.log(`  ${a.id}  ${a.categoryKey}`);
    console.log(`    title:     ${a.title ?? "—"}`);
    console.log(`    sourceUrl: ${a.sourceUrl ?? "—"}`);
  }

  if (!flags.apply) {
    console.log("\nDry-run only. Re-run with --apply to delete.");
    return;
  }

  console.log("\nApplying DB deletes in a transaction…");
  const t0 = Date.now();
  const result = await prisma.$transaction(async (tx) => {
    const nullified = await tx.bill.updateMany({
      where: { imageAssetId: { in: assetIds } },
      data: { imageAssetId: null },
    });
    const deleted = await tx.billImageAsset.deleteMany({
      where: { id: { in: assetIds } },
    });
    return { nullified: nullified.count, deleted: deleted.count };
  });
  console.log(
    `  DB done in ${((Date.now() - t0) / 1000).toFixed(1)}s — bills nullified=${result.nullified}, assets deleted=${result.deleted}`
  );

  if (flags.skipS3) {
    console.log("\n--skip-s3 set: leaving storage objects in place.");
    console.log("\nPurge complete (DB only).");
    return;
  }

  console.log("\nDeleting storage objects (best-effort)…");
  const storage = await getStorage();
  let s3Deleted = 0;
  let s3Failed = 0;
  const t1 = Date.now();
  for (const a of assets) {
    try {
      await storage.deleteObject(a.storageKey);
      s3Deleted += 1;
    } catch (error) {
      s3Failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ! ${a.storageKey}: ${message}`);
    }
    if ((s3Deleted + s3Failed) % 50 === 0) {
      console.log(`  ${s3Deleted + s3Failed}/${assets.length} processed…`);
    }
  }
  console.log(
    `  S3 done in ${((Date.now() - t1) / 1000).toFixed(1)}s — deleted=${s3Deleted}, failed=${s3Failed}`
  );

  console.log("\nPurge complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
