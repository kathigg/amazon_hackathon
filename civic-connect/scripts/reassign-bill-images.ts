/**
 * Global re-assignment of Bill -> BillImageAsset.
 *
 * Goals (different from the ingest-time picker in lib/image-pool.ts):
 *   1. Each BillImageAsset is used by at most one Bill (1-to-1).
 *   2. Assignment requires cosine(billEmbedding, assetEmbedding) >= 0.5.
 *   3. If no qualifying asset exists in the bill's own LoC categoryKeys, widen
 *      the search to additional loc-area/* keys inferred from the bill title
 *      via the existing taxonomy KEYWORD_RULES (inferTopicsFromTitle).
 *   4. Orphan rescue: any bill still unassigned takes argmax over the
 *      remaining unclaimed assets, threshold dropped, uniqueness preserved.
 *
 * Embeddings are already persisted (Bill.topicEmbedding, BillImageAsset.embedding)
 * by embed-bills + embed-image-pool, so this script does not call Bedrock.
 *
 * Usage:
 *   npm run reassign:images               # dry-run, prints the diff
 *   npm run reassign:images -- --apply    # write Bill.imageAssetId in a transaction
 *   npm run reassign:images -- --bill hr-143-119   # report a single bill
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

import { prisma } from "../lib/prisma";
import {
  areaCategoryKey,
  buildCategoryKeysForBill,
  scoreAssetsForBill,
  type AssetScore,
} from "../lib/image-pool";
import { inferTopicsFromTitle, parseTerm } from "../lib/taxonomy";
import { cosine } from "../lib/embeddings";

const THRESHOLD = 0.5;

interface CliFlags {
  apply: boolean;
  billFilter?: string;
}

interface BillRow {
  id: string;
  title: string;
  topicTags: string[];
  legislativeSubjects: string[];
  topicEmbedding: number[];
  imageAssetId: string | null;
}

interface AssetRow {
  id: string;
  cdnUrl: string;
  categoryKey: string;
  embedding: number[];
}

type Stage = "A" | "B" | "C" | "none";

interface Decision {
  billId: string;
  title: string;
  oldAssetId: string | null;
  oldScore: number | null;
  newAssetId: string | null;
  newScore: number | null;
  stage: Stage;
  reason: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--bill" && argv[i + 1]) {
      flags.billFilter = argv[i + 1];
      i += 1;
    }
  }
  return flags;
}

function inferredAreaKeysFromTitle(title: string, exclude: ReadonlySet<string>): string[] {
  const keys: string[] = [];
  for (const encoded of inferTopicsFromTitle(title)) {
    const parsed = parseTerm(encoded);
    if (!parsed) continue;
    const key = areaCategoryKey(parsed.value);
    if (!exclude.has(key)) keys.push(key);
  }
  return Array.from(new Set(keys));
}

function bucket(score: number): string {
  if (score >= 0.7) return "0.70+";
  if (score >= 0.6) return "0.60–0.69";
  if (score >= 0.5) return "0.50–0.59";
  if (score >= 0.4) return "0.40–0.49";
  if (score >= 0.3) return "0.30–0.39";
  return "<0.30";
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "DRY-RUN"} | threshold=${THRESHOLD}`);

  const billReader = prisma.bill as unknown as {
    findMany: (args: {
      select: {
        id: true;
        title: true;
        topicTags: true;
        legislativeSubjects: true;
        topicEmbedding: true;
        imageAssetId: true;
      };
      orderBy: { id: "asc" };
    }) => Promise<BillRow[]>;
  };
  const assetReader = (prisma as unknown as {
    billImageAsset: {
      findMany: (args: {
        where: { retiredAt: null };
        select: { id: true; cdnUrl: true; categoryKey: true; embedding: true };
        orderBy: { id: "asc" };
      }) => Promise<AssetRow[]>;
    };
  }).billImageAsset;

  const [bills, assets] = await Promise.all([
    billReader.findMany({
      select: {
        id: true,
        title: true,
        topicTags: true,
        legislativeSubjects: true,
        topicEmbedding: true,
        imageAssetId: true,
      },
      orderBy: { id: "asc" },
    }),
    assetReader.findMany({
      where: { retiredAt: null },
      select: { id: true, cdnUrl: true, categoryKey: true, embedding: true },
      orderBy: { id: "asc" },
    }),
  ]);

  console.log(`Bills: ${bills.length} | Assets: ${assets.length}`);

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetsByKey = new Map<string, AssetRow[]>();
  for (const a of assets) {
    const list = assetsByKey.get(a.categoryKey) ?? [];
    list.push(a);
    assetsByKey.set(a.categoryKey, list);
  }

  // Build Stage A + Stage B candidates per bill (only ≥ THRESHOLD).
  type StageCandidate = AssetScore & { stage: "A" | "B"; billId: string };
  const candidates: StageCandidate[] = [];
  const stageBKeysByBill = new Map<string, string[]>();

  for (const bill of bills) {
    if (bill.topicEmbedding.length === 0) continue;

    const stageAKeys = new Set(
      buildCategoryKeysForBill(bill.topicTags, bill.legislativeSubjects)
    );

    const stageAPool: AssetRow[] = [];
    for (const key of stageAKeys) {
      const rows = assetsByKey.get(key);
      if (rows) stageAPool.push(...rows);
    }
    const stageAScored = scoreAssetsForBill(bill.topicEmbedding, stageAPool)
      .filter((s) => s.score >= THRESHOLD);
    for (const s of stageAScored) {
      candidates.push({ ...s, stage: "A", billId: bill.id });
    }

    // Only compute Stage B for bills with no Stage A survivor.
    if (stageAScored.length === 0) {
      const stageBKeys = inferredAreaKeysFromTitle(bill.title, stageAKeys);
      stageBKeysByBill.set(bill.id, stageBKeys);
      const stageBPool: AssetRow[] = [];
      for (const key of stageBKeys) {
        const rows = assetsByKey.get(key);
        if (rows) stageBPool.push(...rows);
      }
      const stageBScored = scoreAssetsForBill(bill.topicEmbedding, stageBPool)
        .filter((s) => s.score >= THRESHOLD);
      for (const s of stageBScored) {
        candidates.push({ ...s, stage: "B", billId: bill.id });
      }
    }
  }

  // Greedy allocation: Stage A first, then Stage B, both score-desc.
  // Each bill and each asset can be claimed at most once.
  candidates.sort((x, y) => {
    if (x.stage !== y.stage) return x.stage === "A" ? -1 : 1;
    return y.score - x.score;
  });

  const billDecision = new Map<string, Decision>();
  const claimedAssets = new Set<string>();

  for (const bill of bills) {
    billDecision.set(bill.id, {
      billId: bill.id,
      title: bill.title,
      oldAssetId: bill.imageAssetId,
      oldScore: null,
      newAssetId: null,
      newScore: null,
      stage: "none",
      reason: "",
    });
  }

  // Compute oldScore for each bill (against its currently-assigned asset).
  for (const bill of bills) {
    const d = billDecision.get(bill.id);
    if (!d || !bill.imageAssetId) continue;
    const asset = assetById.get(bill.imageAssetId);
    if (!asset || asset.embedding.length === 0 || bill.topicEmbedding.length === 0) continue;
    d.oldScore = cosine(bill.topicEmbedding, asset.embedding);
  }

  for (const c of candidates) {
    const d = billDecision.get(c.billId);
    if (!d || d.newAssetId !== null) continue;
    if (claimedAssets.has(c.id)) continue;
    d.newAssetId = c.id;
    d.newScore = c.score;
    d.stage = c.stage;
    d.reason = c.stage === "A" ? "local LoC label" : "inferred from title keyword";
    claimedAssets.add(c.id);
  }

  // Stage C — orphan rescue: global greedy over (orphan bill × unclaimed asset)
  // pairs by cosine desc, no threshold, uniqueness still enforced.
  const orphans = bills.filter(
    (b) => b.topicEmbedding.length > 0 && billDecision.get(b.id)?.newAssetId === null
  );
  if (orphans.length > 0) {
    const stageCPairs: { billId: string; assetId: string; score: number }[] = [];
    for (const bill of orphans) {
      const remaining = assets.filter(
        (a) => !claimedAssets.has(a.id) && a.embedding.length > 0
      );
      for (const scored of scoreAssetsForBill(bill.topicEmbedding, remaining)) {
        stageCPairs.push({ billId: bill.id, assetId: scored.id, score: scored.score });
      }
    }
    stageCPairs.sort((x, y) => y.score - x.score);
    for (const p of stageCPairs) {
      const d = billDecision.get(p.billId);
      if (!d || d.newAssetId !== null) continue;
      if (claimedAssets.has(p.assetId)) continue;
      d.newAssetId = p.assetId;
      d.newScore = p.score;
      d.stage = "C";
      d.reason = "orphan rescue (no ≥ threshold match)";
      claimedAssets.add(p.assetId);
    }
  }

  // Report.
  const decisions = Array.from(billDecision.values());
  const shown = flags.billFilter
    ? decisions.filter((d) => d.billId === flags.billFilter)
    : decisions;

  const counts = { kept: 0, swapped: 0, newlyAssigned: 0, droppedToNull: 0, stageA: 0, stageB: 0, stageC: 0, none: 0 };
  const histogram = new Map<string, number>();
  for (const d of decisions) {
    if (d.newAssetId === d.oldAssetId && d.newAssetId !== null) counts.kept += 1;
    else if (d.newAssetId !== null && d.oldAssetId !== null) counts.swapped += 1;
    else if (d.newAssetId !== null && d.oldAssetId === null) counts.newlyAssigned += 1;
    else if (d.newAssetId === null && d.oldAssetId !== null) counts.droppedToNull += 1;
    if (d.stage === "A") counts.stageA += 1;
    else if (d.stage === "B") counts.stageB += 1;
    else if (d.stage === "C") counts.stageC += 1;
    else counts.none += 1;
    if (d.newScore !== null) {
      const b = bucket(d.newScore);
      histogram.set(b, (histogram.get(b) ?? 0) + 1);
    }
  }

  console.log("\n=== Per-bill decisions ===");
  for (const d of shown) {
    const fmt = (s: number | null) => (s === null ? "n/a   " : s.toFixed(4));
    const changed = d.newAssetId !== d.oldAssetId ? "*" : " ";
    console.log(
      `${changed} ${d.billId.padEnd(14)} [${d.stage}] old=${d.oldAssetId ?? "—".padEnd(25)} (${fmt(d.oldScore)}) -> new=${d.newAssetId ?? "—"} (${fmt(d.newScore)})  ${d.reason}`
    );
  }

  console.log("\n=== Stage breakdown ===");
  console.log(`  Stage A (local LoC, ≥${THRESHOLD}):       ${counts.stageA}`);
  console.log(`  Stage B (title-keyword, ≥${THRESHOLD}):    ${counts.stageB}`);
  console.log(`  Stage C (orphan rescue, no floor):     ${counts.stageC}`);
  console.log(`  Unassigned:                            ${counts.none}`);

  console.log("\n=== Change summary ===");
  console.log(`  Kept:           ${counts.kept}`);
  console.log(`  Swapped:        ${counts.swapped}`);
  console.log(`  Newly assigned: ${counts.newlyAssigned}`);
  console.log(`  Dropped→NULL:   ${counts.droppedToNull}`);

  console.log("\n=== New-score histogram ===");
  for (const key of ["0.70+", "0.60–0.69", "0.50–0.59", "0.40–0.49", "0.30–0.39", "<0.30"]) {
    const n = histogram.get(key) ?? 0;
    if (n > 0) console.log(`  ${key.padEnd(12)} ${"█".repeat(Math.min(n, 60))} ${n}`);
  }

  console.log("\n=== Uniqueness check ===");
  const usage = new Map<string, number>();
  for (const d of decisions) {
    if (!d.newAssetId) continue;
    usage.set(d.newAssetId, (usage.get(d.newAssetId) ?? 0) + 1);
  }
  const dupes = Array.from(usage.entries()).filter(([, n]) => n > 1);
  if (dupes.length === 0) {
    console.log("  OK — every assigned asset is used by exactly one bill.");
  } else {
    console.log(`  FAIL — ${dupes.length} assets assigned to >1 bill:`);
    for (const [aid, n] of dupes) console.log(`    ${aid}: ${n} bills`);
  }

  if (!flags.apply) {
    console.log("\nDry-run only. Re-run with --apply to persist.");
    return;
  }

  const toWrite = decisions.filter((d) => d.newAssetId !== d.oldAssetId);
  console.log(`\nApplying ${toWrite.length} updates in a transaction…`);
  await prisma.$transaction(
    toWrite.map((d) =>
      (prisma.bill as unknown as {
        update: (args: { where: { id: string }; data: { imageAssetId: string | null } }) => unknown;
      }).update({
        where: { id: d.billId },
        data: { imageAssetId: d.newAssetId },
      }) as ReturnType<typeof prisma.bill.update>
    )
  );
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
