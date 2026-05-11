/**
 * After the PDF purge, some loc-area cells fall below a viable pool size
 * (e.g. Economics and Public Finance: 0, Taxation: 3). This script re-runs
 * the existing curation flow for just those thin cells, with the PDF filter
 * already in place inside lib/wikimedia-commons.ts.
 *
 * Reuses runCommit + runAudit + buildAreaCells from scripts/curate-images.ts —
 * no separate fetch / download / insert path. The default --max-per-term is
 * 30 (per the plan).
 *
 * Usage:
 *   npm run recurate:thin                         # audit (dry-run)
 *   npm run recurate:thin -- --apply              # commit
 *   npm run recurate:thin -- --apply --threshold 15
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

import { prisma } from "../lib/prisma";
import {
  DEFAULT_CLI_OPTIONS,
  runAudit,
  runCommit,
  type Cell,
  type CliOptions,
} from "./curate-images";
import { LOC_POLICY_AREA } from "../lib/taxonomy/loc-policy-area";
import { areaCategoryKey } from "../lib/image-pool";

interface CliFlags {
  apply: boolean;
  threshold: number;
  maxPerTerm: number;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { apply: false, threshold: 10, maxPerTerm: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--threshold") flags.threshold = Number(next());
    else if (arg === "--max-per-term") flags.maxPerTerm = Number(next());
  }
  return flags;
}

async function loadCellCounts(): Promise<Map<string, number>> {
  const rows: { categoryKey: string; n: bigint }[] = await prisma.$queryRaw`
    SELECT "categoryKey", COUNT(*)::bigint AS n
    FROM "BillImageAsset"
    WHERE "retiredAt" IS NULL
    GROUP BY 1
  `;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.categoryKey, Number(r.n));
  return counts;
}

function buildKeywordQueriesForTerm(term: string): string[] {
  const rule = LOC_POLICY_AREA.keywordRules.find((r) => r.term === term);
  if (!rule) return [];
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const keyword of rule.keywords) {
    const tidy = keyword.trim();
    if (!tidy || seen.has(tidy)) continue;
    seen.add(tidy);
    extras.push(`${term.toLowerCase()} ${tidy}`);
    if (extras.length >= 2) break;
  }
  return extras;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function cellForTerm(term: string): Cell {
  const queries = [
    ...(LOC_POLICY_AREA.imageQueries[term] ?? []),
    ...buildKeywordQueriesForTerm(term),
  ];
  return {
    categoryKey: areaCategoryKey(term),
    label: term,
    queries: dedupeStrings(queries),
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(
    `Mode: ${flags.apply ? "APPLY" : "DRY-RUN (audit)"} | threshold=${flags.threshold} | max-per-term=${flags.maxPerTerm}`
  );

  const counts = await loadCellCounts();

  const thinCells: Cell[] = [];
  for (const term of LOC_POLICY_AREA.terms) {
    const key = areaCategoryKey(term);
    const n = counts.get(key) ?? 0;
    if (n < flags.threshold) {
      thinCells.push(cellForTerm(term));
    }
  }

  console.log(`\nThin LoC areas (< ${flags.threshold} live assets):`);
  for (const cell of thinCells) {
    const n = counts.get(cell.categoryKey) ?? 0;
    console.log(`  ${n.toString().padStart(4)}  ${cell.label}`);
  }

  if (thinCells.length === 0) {
    console.log("\nNothing to re-curate.");
    return;
  }

  const opts: CliOptions = {
    ...DEFAULT_CLI_OPTIONS,
    audit: !flags.apply,
    mode: "areas",
    maxPerTerm: flags.maxPerTerm,
  };

  if (flags.apply) {
    await runCommit(thinCells, opts);
  } else {
    await runAudit(thinCells, opts);
  }

  if (flags.apply) {
    const after = await loadCellCounts();
    console.log("\nPost-curation cell sizes:");
    for (const cell of thinCells) {
      const before = counts.get(cell.categoryKey) ?? 0;
      const now = after.get(cell.categoryKey) ?? 0;
      console.log(`  ${cell.label.padEnd(50, ".")} ${before} -> ${now}  (+${now - before})`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
