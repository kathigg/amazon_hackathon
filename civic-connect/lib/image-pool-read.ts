import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Fetch the CloudFront URL of each bill's assigned image asset, when any.
 *
 * Uses raw SQL so it stays compatible with both pre- and post-migration
 * schemas. We first ask Postgres whether the BillImageAsset table exists
 * (via `to_regclass`, which returns NULL instead of erroring) and cache the
 * answer for the lifetime of the process. Pre-migration: every call returns
 * an empty map without ever hitting the LEFT JOIN, so Prisma never logs
 * `relation does not exist`. Post-migration: the cache flips to true after
 * the first request and the join runs normally.
 */
let assetsTableExistsCache: boolean | null = null;
let assetsTableExistsPromise: Promise<boolean> | null = null;

async function assetsTableExists(): Promise<boolean> {
  if (assetsTableExistsCache !== null) return assetsTableExistsCache;
  if (!assetsTableExistsPromise) {
    assetsTableExistsPromise = (async () => {
      try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(
          Prisma.sql`SELECT to_regclass('public."BillImageAsset"') IS NOT NULL AS exists`
        );
        const exists = Boolean(rows[0]?.exists);
        assetsTableExistsCache = exists;
        return exists;
      } catch {
        // If even to_regclass fails, treat the table as missing and stay quiet.
        assetsTableExistsCache = false;
        return false;
      } finally {
        assetsTableExistsPromise = null;
      }
    })();
  }
  return assetsTableExistsPromise;
}

export async function fetchAssetUrlsForBills(
  billIds: readonly string[]
): Promise<Map<string, string>> {
  if (billIds.length === 0) return new Map();
  if (!(await assetsTableExists())) return new Map();

  const rows = await prisma.$queryRaw<
    Array<{ id: string; cdn_url: string | null }>
  >(Prisma.sql`
    SELECT b.id, a."cdnUrl" AS cdn_url
    FROM "Bill" b
    LEFT JOIN "BillImageAsset" a
      ON a.id = b."imageAssetId" AND a."retiredAt" IS NULL
    WHERE b.id IN (${Prisma.join([...billIds])})
  `);

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.cdn_url) map.set(row.id, row.cdn_url);
  }
  return map;
}
