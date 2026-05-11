/**
 * One-time bulk embedding pass over Bill.topicEmbedding for existing rows.
 *
 * The ingest hook in lib/bill-ingestion.ts:ensureTopicEmbedding handles new
 * bills going forward. This script covers the historical backlog where rows
 * predate the hook.
 *
 * Corpus = `title — plainLanguage — legislativeSubjects.join(" ")`, truncated
 * inside embedText to ~500 chars (the multimodal model's 128-token cap).
 *
 * Idempotent: re-runs only embed rows where topicEmbeddedAt IS NULL. Throttled
 * to ~10 req/sec.
 *
 * Costs ~$0.01 for the 252 local rows (Titan Text via the multimodal endpoint).
 *
 * Usage:
 *   npm run embed:bills
 *   npm run embed:bills -- --limit 20      # smoke test
 *   npm run embed:bills -- --dry-run
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

import { prisma } from "../lib/prisma";
import { embedText, EMBEDDING_DIM } from "../lib/embeddings";

interface CliFlags {
  limit?: number;
  throttleMs: number;
  dryRun: boolean;
}

interface BillRow {
  id: string;
  title: string;
  legislativeSubjects: string[];
  summary: { plainLanguage: string } | null;
}

type BillReader = {
  findMany: (args: {
    where: { topicEmbeddedAt: null };
    select: {
      id: true;
      title: true;
      legislativeSubjects: true;
      summary: { select: { plainLanguage: true } };
    };
    orderBy: { id: "asc" };
    take?: number;
  }) => Promise<BillRow[]>;
};

type BillUpdater = {
  update: (args: {
    where: { id: string };
    data: { topicEmbedding: number[]; topicEmbeddedAt: Date };
  }) => Promise<unknown>;
};

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

function buildCorpus(row: BillRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(row.title);
  if (row.summary?.plainLanguage) parts.push(row.summary.plainLanguage);
  if (row.legislativeSubjects.length > 0) {
    parts.push(row.legislativeSubjects.join(" "));
  }
  return parts.join(" — ").trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.dryRun ? "DRY-RUN" : "COMMIT"}`);

  const reader = prisma.bill as unknown as BillReader;
  const updater = prisma.bill as unknown as BillUpdater;

  const rows = await reader.findMany({
    where: { topicEmbeddedAt: null },
    select: {
      id: true,
      title: true,
      legislativeSubjects: true,
      summary: { select: { plainLanguage: true } },
    },
    orderBy: { id: "asc" },
    take: flags.limit ?? undefined,
  });
  console.log(`Rows to embed: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const t0 = Date.now();

  for (const row of rows) {
    const corpus = buildCorpus(row);
    if (!corpus) {
      skipped += 1;
      continue;
    }

    try {
      const embedding = await embedText(corpus);
      if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(`unexpected dim ${embedding.length}`);
      }

      if (!flags.dryRun) {
        await updater.update({
          where: { id: row.id },
          data: { topicEmbedding: embedding, topicEmbeddedAt: new Date() },
        });
      }
      ok += 1;

      if (ok % 25 === 0 || ok === rows.length) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = ok / Math.max(elapsed, 0.001);
        console.log(
          `  ${ok}/${rows.length} ok, ${failed} failed, ${skipped} skipped, ${rate.toFixed(2)} rows/s`
        );
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ! ${row.id}: ${message}`);
    }

    if (flags.throttleMs > 0) {
      await sleep(flags.throttleMs);
    }
  }

  const elapsed = (Date.now() - t0) / 1000;
  console.log(
    `Done. ${ok} embedded, ${failed} failed, ${skipped} skipped (empty corpus), ${elapsed.toFixed(1)}s total.`
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
