/**
 * One-time bulk embedding pass over BillImageAsset.
 *
 * For every row where embeddedAt IS NULL, reads the image bytes from storage
 * (filesystem in dev, S3 in prod), calls Bedrock Titan Multimodal G1 v1, and
 * persists the 1024-dim embedding + embeddedAt timestamp.
 *
 * Idempotent: re-runs only embed unembedded rows. Throttled to ~10 req/sec
 * to stay well under the Bedrock TPS limits.
 *
 * Costs ~$0.10–0.20 for the full 1,711-row local pool. Run against the local
 * mirror before migrating rows into Aurora — that way the embeddings travel
 * with the rows in pg_dump → pg_restore.
 *
 * Usage:
 *   npm run embed:images           # whole pool
 *   npm run embed:images -- --limit 50    # smoke test with 50 rows
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

import { prisma } from "../lib/prisma";
import { embedImage, EMBEDDING_DIM } from "../lib/embeddings";
import { getStorage } from "./lib/storage";

interface CliFlags {
  limit?: number;
  throttleMs: number;
  dryRun: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { throttleMs: 100, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) {
      flags.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--throttle-ms" && argv[i + 1]) {
      flags.throttleMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    }
  }
  return flags;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const storage = await getStorage();
  console.log(`Storage: ${storage.describe()}`);
  console.log(`Mode:    ${flags.dryRun ? "DRY-RUN" : "COMMIT"}`);

  const rows = await prisma.billImageAsset.findMany({
    where: { embeddedAt: null, retiredAt: null },
    select: { id: true, storageKey: true, mimeType: true },
    orderBy: { createdAt: "asc" },
    take: flags.limit ?? undefined,
  });
  console.log(`Rows to embed: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;
  const t0 = Date.now();

  for (const row of rows) {
    try {
      const bytes = await storage.getImage(row.storageKey);
      const embedding = await embedImage(bytes);
      if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(`unexpected dim ${embedding.length}`);
      }

      if (!flags.dryRun) {
        await prisma.billImageAsset.update({
          where: { id: row.id },
          data: { embedding, embeddedAt: new Date() },
        });
      }
      ok += 1;

      if (ok % 25 === 0 || ok === rows.length) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = ok / Math.max(elapsed, 0.001);
        console.log(
          `  ${ok}/${rows.length} ok, ${failed} failed, ${rate.toFixed(2)} rows/s`
        );
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ! ${row.id} (${row.storageKey}): ${message}`);
    }

    if (flags.throttleMs > 0) {
      await sleep(flags.throttleMs);
    }
  }

  const elapsed = (Date.now() - t0) / 1000;
  console.log(
    `Done. ${ok} embedded, ${failed} failed, ${elapsed.toFixed(1)}s total.`
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
