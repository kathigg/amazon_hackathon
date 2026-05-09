/**
 * Curate a self-hosted bill image pool from Wikimedia Commons → storage → Postgres.
 *
 * Image source is Wikimedia Commons (no auth, no Cloudflare gate). Filter is
 * strict CC0 / Public Domain. Storage backend is filesystem (set
 * IMAGE_LOCAL_DIR=public/curated-images) or S3 (set IMAGE_S3_BUCKET +
 * IMAGE_CDN_HOST). Audit mode never writes anywhere.
 *
 * Modes:
 *   --audit                Dry-run. No storage writes, no DB writes. Per-cell counts only.
 *   --commit (default)     Download + write + insert BillImageAsset rows.
 *
 * Targets:
 *   --mode areas           (default) one cell per LoC policy area (32 cells).
 *   --mode subjects        legislative subjects discovered from Bill.legislativeSubjects.
 *
 * Knobs:
 *   --max-per-term <N>     cap candidates kept per cell after filter+dedupe (default 80).
 *   --max-pages <N>        Commons pages to walk per query (default 5; 50 results/page).
 *   --top <N>              with --mode subjects, top-N subjects to curate (default 100).
 *   --only <term>          curate only one term/subject (debug).
 *   --throttle-ms <ms>     delay between Commons requests (default 600).
 *
 * Examples:
 *   IMAGE_LOCAL_DIR=public/curated-images npx tsx scripts/curate-images.ts --audit
 *   IMAGE_LOCAL_DIR=public/curated-images npx tsx scripts/curate-images.ts --max-per-term 60
 */

import "dotenv/config";
import crypto from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../lib/prisma";
import {
  type OpenverseImage,
  isUsableImage,
  scoreImage,
} from "../lib/openverse";
import { searchWikimediaCommonsImages } from "../lib/wikimedia-commons";
import { LOC_POLICY_AREA } from "../lib/taxonomy/loc-policy-area";
import { getStorage, type Storage } from "./lib/storage";
import { areaCategoryKey, subjectCategoryKey } from "../lib/image-pool";

interface CliOptions {
  audit: boolean;
  mode: "areas" | "subjects";
  maxPerTerm: number;
  maxPages: number;
  pageSize: number;
  top: number;
  only: string | null;
  throttleMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    audit: false,
    mode: "areas",
    maxPerTerm: 80,
    maxPages: 5,
    pageSize: 50,
    top: 100,
    only: null,
    throttleMs: 600,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--audit") opts.audit = true;
    else if (arg === "--commit") opts.audit = false;
    else if (arg === "--mode") opts.mode = next() as "areas" | "subjects";
    else if (arg === "--max-per-term") opts.maxPerTerm = Number(next());
    else if (arg === "--max-pages") opts.maxPages = Number(next());
    else if (arg === "--page-size") opts.pageSize = Number(next());
    else if (arg === "--top") opts.top = Number(next());
    else if (arg === "--only") opts.only = next();
    else if (arg === "--throttle-ms") opts.throttleMs = Number(next());
  }

  if (opts.mode !== "areas" && opts.mode !== "subjects") {
    throw new Error(`--mode must be "areas" or "subjects"; got ${opts.mode}`);
  }
  return opts;
}

interface Cell {
  categoryKey: string;
  label: string;
  queries: string[];
}

function buildAreaCells(only: string | null): Cell[] {
  const cells: Cell[] = [];
  for (const term of LOC_POLICY_AREA.terms) {
    if (only && term !== only) continue;
    const queries = [
      ...(LOC_POLICY_AREA.imageQueries[term] ?? []),
      ...buildKeywordQueriesForTerm(term),
    ];
    cells.push({
      categoryKey: areaCategoryKey(term),
      label: term,
      queries: dedupeStrings(queries),
    });
  }
  return cells;
}

function buildKeywordQueriesForTerm(term: string): string[] {
  const rule = LOC_POLICY_AREA.keywordRules.find((r) => r.term === term);
  if (!rule) return [];
  // Use first 3 keywords as additional queries — adds breadth without flooding.
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

async function buildSubjectCells(opts: CliOptions): Promise<Cell[]> {
  // Tally legislativeSubjects across the Bill table.
  const bills = await prisma.bill.findMany({
    select: { legislativeSubjects: true, topicTags: true },
  });
  const counts = new Map<string, number>();
  for (const bill of bills) {
    const subjects = (bill as unknown as { legislativeSubjects?: string[] })
      .legislativeSubjects ?? [];
    for (const subject of subjects) {
      const tidy = subject?.trim();
      if (!tidy) continue;
      counts.set(tidy, (counts.get(tidy) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, opts.top).map(([subject]) => subject);

  const cells: Cell[] = [];
  for (const subject of top) {
    if (opts.only && subject !== opts.only) continue;
    cells.push({
      categoryKey: subjectCategoryKey(subject),
      label: subject,
      queries: dedupeStrings([subject, `${subject} united states`, `${subject} policy`]),
    });
  }
  return cells;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

interface CandidateImage extends OpenverseImage {
  _query: string;
}

async function gatherCandidatesForCell(cell: Cell, opts: CliOptions): Promise<CandidateImage[]> {
  const seenIds = new Set<string>();
  const collected: CandidateImage[] = [];
  let totalRaw = 0;

  for (const query of cell.queries) {
    for (let page = 1; page <= opts.maxPages; page += 1) {
      let response;
      try {
        response = await searchWikimediaCommonsImages({
          query,
          page,
          pageSize: opts.pageSize,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ! query "${query}" page ${page}: ${message}`);
        await sleep(opts.throttleMs);
        break;
      }

      totalRaw += response.rawCount;
      for (const image of response.results) {
        const id = image.id ?? image.url ?? "";
        if (!id || seenIds.has(id)) continue;
        if (!isUsableWithDimensions(image)) continue;
        seenIds.add(id);
        collected.push({ ...image, _query: query });
      }

      await sleep(opts.throttleMs);
      if (!response.hasMore) break;
    }

    if (collected.length >= opts.maxPerTerm * 2) break; // soft early-stop
  }

  collected.sort((a, b) => scoreImage(b) - scoreImage(a));
  const trimmed = collected.slice(0, opts.maxPerTerm);

  console.log(
    `  ${cell.label.padEnd(50, ".")} raw=${totalRaw} usable=${collected.length} kept=${trimmed.length}`
  );
  return trimmed;
}

function isUsableWithDimensions(image: OpenverseImage): boolean {
  if (!isUsableImage(image)) return false;
  if (typeof image.width !== "number" || typeof image.height !== "number") {
    return false;
  }
  return true;
}

interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  sha256: string;
}

async function downloadCandidate(image: OpenverseImage): Promise<DownloadedImage | null> {
  if (!image.url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(image.url, {
      signal: controller.signal,
      headers: { "User-Agent": "CivicConnect/0.1 (Image curator)" },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = mimeToExt(contentType);
    if (!ext) return null;

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > 5 * 1024 * 1024) return null; // 5MB cap
    if (buffer.byteLength < 8 * 1024) return null; // <8KB is suspicious

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { bytes: buffer, contentType, ext, sha256 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mimeToExt(mime: string): string | null {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

function buildStorageKey(categoryKey: string, sha256: string, ext: string): string {
  // categoryKey is "loc-area/Health" or "loc-subject/Medicare" — preserve as path segments,
  // but URL-encode each segment so spaces and commas don't break the S3 key.
  const segments = categoryKey
    .split("/")
    .map((segment) => encodeURIComponent(segment));
  return `v1/${segments.join("/")}/${sha256}.${ext}`;
}

async function commitCandidate(
  storage: Storage,
  cell: Cell,
  image: CandidateImage,
  download: DownloadedImage
): Promise<"inserted" | "duplicate" | "exists"> {
  const existingByHash = await prisma.billImageAsset.findUnique({
    where: { contentSha256: download.sha256 },
    select: { id: true },
  });
  if (existingByHash) return "duplicate";

  const storageKey = buildStorageKey(cell.categoryKey, download.sha256, download.ext);

  if (!(await storage.objectExists(storageKey))) {
    await storage.putImage(storageKey, download.bytes, download.contentType);
  }

  await prisma.billImageAsset.create({
    data: {
      categoryKey: cell.categoryKey,
      storageKey,
      cdnUrl: storage.buildPublicUrl(storageKey),
      contentSha256: download.sha256,
      widthPx: image.width ?? 0,
      heightPx: image.height ?? 0,
      mimeType: download.contentType,
      bytes: download.bytes.byteLength,
      sourceProvider: "openverse",
      sourceForeignId: image.id ?? null,
      sourceUrl: image.foreign_landing_url,
      originalUrl: image.url,
      title: image.title,
      creator: image.creator,
      creatorUrl: image.creator_url,
      license: (image.license ?? "").toLowerCase() || "cc0",
      licenseVersion: image.license_version,
      searchQuery: image._query,
    },
  });

  return "inserted";
}

async function runAudit(cells: Cell[], opts: CliOptions): Promise<void> {
  console.log(
    `\nAudit mode — ${cells.length} cells, source=Wikimedia Commons, license=CC0/PDM\n`
  );
  const summary: Array<{ label: string; kept: number }> = [];

  for (const cell of cells) {
    const candidates = await gatherCandidatesForCell(cell, opts);
    summary.push({ label: cell.label, kept: candidates.length });
  }

  summary.sort((a, b) => b.kept - a.kept);
  console.log("\nPer-cell post-filter counts (sorted):");
  for (const row of summary) {
    console.log(`  ${row.kept.toString().padStart(4)}  ${row.label}`);
  }

  const total = summary.reduce((s, r) => s + r.kept, 0);
  const median = summary[Math.floor(summary.length / 2)]?.kept ?? 0;
  const min = summary[summary.length - 1]?.kept ?? 0;
  const max = summary[0]?.kept ?? 0;
  console.log(
    `\nTotal kept: ${total} across ${summary.length} cells. min=${min} median=${median} max=${max}.`
  );
}

async function runCommit(cells: Cell[], opts: CliOptions): Promise<void> {
  // Resolve storage backend up front so we fail fast on missing env, not after
  // hours of Openverse fetching.
  const storage = await getStorage();
  console.log(`\nCommit mode — storage=${storage.describe()} cells=${cells.length}`);

  const stats = { inserted: 0, duplicates: 0, downloadFailed: 0 };

  for (const cell of cells) {
    const candidates = await gatherCandidatesForCell(cell, opts);
    if (candidates.length === 0) continue;

    let cellInserted = 0;
    for (const image of candidates) {
      const existingByForeignId = image.id
        ? await prisma.billImageAsset.findFirst({
            where: { sourceForeignId: image.id },
            select: { id: true },
          })
        : null;
      if (existingByForeignId) {
        stats.duplicates += 1;
        continue;
      }

      const download = await downloadCandidate(image);
      if (!download) {
        stats.downloadFailed += 1;
        continue;
      }

      try {
        const result = await commitCandidate(storage, cell, image, download);
        if (result === "inserted") {
          stats.inserted += 1;
          cellInserted += 1;
        } else {
          stats.duplicates += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ! commit failed for ${image.url}: ${message}`);
      }
    }

    console.log(`    -> ${cell.label}: +${cellInserted}`);
  }

  console.log(
    `\nDone. inserted=${stats.inserted} duplicates=${stats.duplicates} downloadFailed=${stats.downloadFailed}`
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const cells =
    opts.mode === "areas" ? buildAreaCells(opts.only) : await buildSubjectCells(opts);

  if (cells.length === 0) {
    console.log("No cells to process.");
    return;
  }

  if (opts.audit) {
    await runAudit(cells, opts);
  } else {
    await runCommit(cells, opts);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
