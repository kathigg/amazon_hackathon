/**
 * Wikimedia Commons image search.
 *
 * Returns the same normalized shape as `searchOpenverseImages` so the
 * curation script can swap sources without other changes. We filter strictly
 * for CC0 / Public Domain at the source — anything CC BY or CC BY-SA is
 * rejected here, before the script even sees it.
 *
 * No auth, no Cloudflare bot challenge — Commons exposes a plain MediaWiki
 * API at https://commons.wikimedia.org/w/api.php.
 */

import type { OpenverseImage } from "./openverse";

const COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const COMMONS_USER_AGENT =
  "CivicConnectImageCurator/0.1 (https://civicconnect.net) Node-fetch";

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

interface CommonsPage {
  pageid: number;
  ns: number;
  title: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
  continue?: { gsroffset?: number };
}

export interface CommonsSearchResult {
  results: OpenverseImage[];
  hasMore: boolean;
  rawCount: number;
}

export async function searchWikimediaCommonsImages({
  query,
  page = 1,
  pageSize = 50,
  signal,
}: {
  query: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<CommonsSearchResult> {
  const offset = (page - 1) * pageSize;
  const url = new URL(COMMONS_ENDPOINT);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6"); // File:
  url.searchParams.set("gsrlimit", String(pageSize));
  url.searchParams.set("gsroffset", String(offset));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "1280");

  const response = await fetch(url, {
    headers: { "User-Agent": COMMONS_USER_AGENT, Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Wikimedia Commons API error: ${response.status}`);
  }

  const data = (await response.json()) as CommonsResponse;
  const pages = Object.values(data.query?.pages ?? {});

  const results: OpenverseImage[] = [];
  for (const p of pages) {
    const mapped = mapCommonsPage(p);
    if (mapped) results.push(mapped);
  }

  return {
    results,
    hasMore: Boolean(data.continue?.gsroffset),
    rawCount: pages.length,
  };
}

function mapCommonsPage(p: CommonsPage): OpenverseImage | null {
  const ii = p.imageinfo?.[0];
  if (!ii) return null;

  const em = ii.extmetadata ?? {};
  const license = (em.LicenseShortName?.value ?? "").trim();
  const normalized = normalizeLicense(license);
  if (!normalized) return null;

  const artistHtml = em.Artist?.value ?? null;
  const artist = artistHtml ? stripHtml(artistHtml) : null;
  const creatorUrl = artistHtml ? extractFirstHref(artistHtml) : null;

  const cleanTitle = p.title?.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "") ?? null;

  return {
    id: `commons-${p.pageid}`,
    title: cleanTitle,
    url: ii.url ?? null,
    thumbnail: ii.thumburl ?? ii.url ?? null,
    creator: artist,
    creator_url: creatorUrl,
    license: normalized,
    license_version: null,
    foreign_landing_url: ii.descriptionurl ?? null,
    source: "wikimedia_commons",
    width: ii.width ?? null,
    height: ii.height ?? null,
    tags: null,
    category: null,
  };
}

/**
 * Wikimedia returns license values like "CC0 1.0", "Public domain",
 * "PD-USGov", "CC BY-SA 4.0", etc. We accept only CC0 and public-domain
 * variants (per the user's CC0/PDM-only choice).
 */
function normalizeLicense(license: string): "cc0" | "pdm" | null {
  const lower = license.toLowerCase().trim();
  if (!lower) return null;
  // Reject any "by" / "by-sa" / "by-nc" variants up front so a stray
  // "Public domain (CC BY-SA)" badge isn't accepted.
  if (/\b(cc\s*by|by-sa|by-nc|by-nd)\b/.test(lower)) return null;
  if (lower.startsWith("cc0") || lower === "cc-zero") return "cc0";
  if (lower.startsWith("public domain")) return "pdm";
  if (lower.startsWith("pd-") || lower.startsWith("pd ")) return "pdm";
  if (/\bpd\s*us\s*gov/.test(lower)) return "pdm";
  if (/\bpdm\b/.test(lower)) return "pdm";
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractFirstHref(html: string): string | null {
  const match = html.match(/href=["']([^"']+)["']/i);
  if (!match) return null;
  let href = match[1];
  if (href.startsWith("//")) href = `https:${href}`;
  return href;
}
