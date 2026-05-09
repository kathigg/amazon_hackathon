import { isSummaryPlaceholder } from "./bill-summary";
import { getActiveTaxonomy, parseTerm } from "./taxonomy";

const OPENVERSE_IMAGES_ENDPOINT = "https://api.openverse.org/v1/images/";
// Cloudflare's bot heuristics in front of api.openverse.org reject our prior
// custom UA ("CivicConnect/0.1 (...)") with a managed-challenge 403. A normal
// browser UA passes. We're an honest API consumer either way.
const OPENVERSE_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export interface OpenverseImage {
  id?: string | null;
  title: string | null;
  url: string | null;
  thumbnail: string | null;
  creator: string | null;
  creator_url: string | null;
  license: string | null;
  license_version: string | null;
  foreign_landing_url: string | null;
  source: string | null;
  width?: number | null;
  height?: number | null;
  tags?: Array<{ name?: string | null }> | null;
  category?: string | null;
}

interface OpenverseImageSearchResponse {
  results?: OpenverseImage[];
  page_count?: number;
  result_count?: number;
}

export interface OpenverseBillImage {
  imageUrl: string;
  imageThumbnailUrl: string;
  imageTitle: string | null;
  imagePageUrl: string | null;
  imageCreator: string | null;
  imageCreatorUrl: string | null;
  imageLicense: string | null;
  imageLicenseVersion: string | null;
  imageSource: string | null;
  imageSearchQuery: string;
  imageFetchedAt: Date;
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "act",
  "amend",
  "amendment",
  "and",
  "bill",
  "for",
  "in",
  "of",
  "or",
  "the",
  "to",
  "with",
]);

const ISSUE_QUERY_OVERRIDES: Array<{
  matches: string[];
  queries: string[];
}> = [
  {
    matches: [
      "abortion",
      "reproductive",
      "mifepristone",
      "contraception",
      "birth control",
      "ivf",
      "family planning",
    ],
    queries: ["abortion pill", "reproductive healthcare pill"],
  },
  {
    matches: [
      "veteran",
      "veterans affairs",
      "service member",
      "servicemember",
      "va benefits",
      "va health",
    ],
    queries: [
      "veterans memorial american flag",
      "veterans affairs building exterior",
    ],
  },
  {
    matches: ["housing", "rent", "mortgage", "homeless", "tenant"],
    queries: ["affordable housing apartment buildings", "neighborhood homes city block"],
  },
  {
    matches: ["climate", "environment", "clean energy", "emissions", "wildfire"],
    queries: ["clean energy landscape", "environment conservation landscape"],
  },
  {
    matches: ["technology", "cyber", "artificial intelligence", "ai", "privacy", "data"],
    queries: ["technology data network abstract", "digital privacy abstract"],
  },
  {
    matches: ["education", "student", "school", "college", "teacher"],
    queries: ["education books classroom", "public school building"],
  },
  {
    matches: ["immigration", "border", "asylum", "visa", "migrant", "citizenship"],
    queries: ["immigration passport border crossing", "citizenship documents government office"],
  },
  {
    matches: ["infrastructure", "bridge", "highway", "transit", "rail", "airport"],
    queries: ["bridge infrastructure highway", "public transit infrastructure"],
  },
  {
    matches: ["civil rights", "equality", "discrimination", "voting rights", "justice"],
    queries: ["voting rights ballot box", "courthouse exterior justice building"],
  },
  {
    matches: ["economy", "tax", "budget", "trade", "small business", "inflation"],
    queries: ["economy financial district", "small business main street"],
  },
  {
    matches: ["healthcare", "medicare", "medicaid", "medical", "hospital", "drug"],
    queries: ["healthcare hospital medicine", "hospital exterior medical equipment"],
  },
  {
    matches: ["agriculture", "farm", "crop", "rural", "food"],
    queries: ["farm fields agriculture", "farmer crops rural landscape"],
  },
  {
    matches: ["foreign", "diplomatic", "treaty", "sanction", "international"],
    queries: ["international diplomacy flags", "conference table diplomatic flags"],
  },
  {
    matches: ["defense", "military", "national security", "army", "navy", "air force"],
    queries: ["naval ship national security", "military aircraft defense"],
  },
] as const;

function imageQueriesForTopic(topic: string): readonly string[] {
  const parsed = parseTerm(topic);
  if (!parsed) return [];
  const def = getActiveTaxonomy();
  return def.imageQueries[parsed.value] ?? [];
}

export async function fetchBestOpenverseBillImage({
  title,
  topicTags,
  summary,
}: {
  title: string;
  topicTags: string[];
  summary?: string;
}): Promise<OpenverseBillImage | null> {
  const queries = buildOpenverseQueries(title, topicTags, summary);

  for (const query of queries) {
    const image = await searchBestImageForQuery(query);
    if (!image) {
      continue;
    }

    return {
      imageUrl: image.url!,
      imageThumbnailUrl: image.thumbnail!,
      imageTitle: image.title,
      imagePageUrl: image.foreign_landing_url,
      imageCreator: image.creator,
      imageCreatorUrl: image.creator_url,
      imageLicense: image.license,
      imageLicenseVersion: image.license_version,
      imageSource: image.source,
      imageSearchQuery: query,
      imageFetchedAt: new Date(),
    };
  }

  return null;
}

export function getNoImageAttemptMetadata(query: string | null = null) {
  return {
    imageUrl: null,
    imageThumbnailUrl: null,
    imageTitle: null,
    imagePageUrl: null,
    imageCreator: null,
    imageCreatorUrl: null,
    imageLicense: null,
    imageLicenseVersion: null,
    imageSource: null,
    imageSearchQuery: query,
    imageFetchedAt: new Date(),
  };
}

export function formatOpenverseLicense(
  license: string | null | undefined,
  version: string | null | undefined
) {
  if (!license) {
    return null;
  }

  const upper = license.toUpperCase();
  return version ? `${upper} ${version}` : upper;
}

async function searchBestImageForQuery(query: string): Promise<OpenverseImage | null> {
  const url = new URL(OPENVERSE_IMAGES_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "8");

  const response = await fetch(url, {
    headers: {
      "User-Agent": OPENVERSE_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Openverse API error: ${response.status}`);
  }

  const data = (await response.json()) as OpenverseImageSearchResponse;
  const candidates = (data.results ?? []).filter(isUsableImage);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => scoreImage(right) - scoreImage(left))[0];
}

export async function searchOpenverseImages({
  query,
  license = "cc0,pdm",
  pageSize = 100,
  page = 1,
  signal,
}: {
  query: string;
  license?: string;
  pageSize?: number;
  page?: number;
  signal?: AbortSignal;
}): Promise<{
  results: OpenverseImage[];
  pageCount: number;
  resultCount: number;
}> {
  const url = new URL(OPENVERSE_IMAGES_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("page", String(page));
  if (license) {
    url.searchParams.set("license", license);
  }

  const response = await fetch(url, {
    headers: { "User-Agent": OPENVERSE_USER_AGENT },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Openverse API error: ${response.status}`);
  }

  const data = (await response.json()) as OpenverseImageSearchResponse;
  return {
    results: data.results ?? [],
    pageCount: data.page_count ?? 0,
    resultCount: data.result_count ?? 0,
  };
}

export { isUsableImage, isLikelyPhotographic, scoreImage };

function buildOpenverseQueries(title: string, topicTags: string[], summary?: string) {
  const normalizedTitle = title.toLowerCase();
  const cleanedSummary =
    summary && !isSummaryPlaceholder(summary) ? summary : undefined;
  const queries: string[] = [];

  // Priority 1: Use AI summary to extract key concepts (most relevant!)
  if (cleanedSummary) {
    const summaryKeywords = extractKeywordsFromSummary(cleanedSummary);
    if (summaryKeywords) {
      queries.push(summaryKeywords);
    }
  }

  // Priority 2: Check for issue-specific overrides
  for (const override of ISSUE_QUERY_OVERRIDES) {
    if (
      override.matches.some(
        (match) =>
          normalizedTitle.includes(match) ||
          cleanedSummary?.toLowerCase().includes(match)
      )
    ) {
      queries.push(...override.queries);
      break;
    }
  }

  // Priority 3: Use topic tags
  for (const topic of topicTags) {
    queries.push(...imageQueriesForTopic(topic));
  }

  // Priority 4: Extract keywords from title (least reliable due to abbreviations)
  if (!cleanedSummary) {
    const titleKeywords = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 3 &&
          !TITLE_STOP_WORDS.has(word) &&
          !/^\d+$/.test(word) &&
          !["voice", "save", "stop", "care", "fair", "secure"].includes(word)
      )
      .slice(0, 4)
      .join(" ");

    const primaryTopic = topicTags[0]
      ? parseTerm(topicTags[0])?.value.toLowerCase()
      : undefined;
    if (primaryTopic) {
      queries.push(`${primaryTopic} ${titleKeywords}`);
    }
  }

  // Fallback
  if (queries.length === 0) {
    queries.push("united states capitol building");
  }

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

/**
 * Extract key visual concepts from AI summary
 * Example: "This bill would establish a new office for victims of immigration crimes"
 * → "immigration victims support office"
 */
function extractKeywordsFromSummary(summary: string): string {
  // Remove common legislative phrases
  const cleaned = summary
    .toLowerCase()
    .replace(/this bill would|this bill|the bill|would require|would establish|would prohibit|would authorize/g, "")
    .replace(/[^a-z0-9\s]/g, " ");

  // Extract meaningful nouns and action words
  const words = cleaned
    .split(/\s+/)
    .filter((word) => 
      word.length > 3 && 
      !TITLE_STOP_WORDS.has(word) && 
      !/^\d+$/.test(word) &&
      !["that", "this", "from", "with", "have", "been", "were", "their", "would", "could", "should", "people", "american", "americans", "federal", "government"].includes(word)
    );

  // Take first 4-5 meaningful words
  const keywords = words.slice(0, 5).join(" ");
  
  return keywords || "";
}

function isUsableImage(image: OpenverseImage) {
  if (!image.url || !image.thumbnail) {
    return false;
  }

  if (!isLikelyPhotographic(image)) {
    return false;
  }

  if (typeof image.width === "number" && typeof image.height === "number") {
    // Avoid tiny and banner-like assets that look bad on cards.
    if (image.width < 640 || image.height < 360) {
      return false;
    }
    const ratio = image.width / image.height;
    if (ratio > 2.4 || ratio < 0.55) {
      return false;
    }
  }

  return true;
}

function scoreImage(image: OpenverseImage) {
  let score = 0;
  const normalizedTitle = image.title?.toLowerCase() ?? "";

  if (image.thumbnail) score += 5;
  if (image.creator) score += 2;
  if (image.foreign_landing_url) score += 2;
  if (image.title) score += 1;

  if (image.width && image.height) {
    const ratio = image.width / image.height;
    score += Math.max(0, 3 - Math.abs(1.5 - ratio) * 2);
  }

  if (
    /\b(portrait|man|woman|boy|girl|people|person|selfie|headshot|survivor|child|children|family|doctor|nurse|group|crowd)\b/.test(
      normalizedTitle
    )
  ) {
    score -= 8;
  }

  if (/\b(building|landscape|bridge|document|classroom|courthouse|hospital|office|street|capitol|forest|ship|aircraft|flag|map|ballot)\b/.test(normalizedTitle)) {
    score += 2;
  }

  return score;
}

function isLikelyPhotographic(image: OpenverseImage) {
  const source = `${image.source ?? ""}`.toLowerCase();
  const title = `${image.title ?? ""}`.toLowerCase();
  const creator = `${image.creator ?? ""}`.toLowerCase();
  const category = `${image.category ?? ""}`.toLowerCase();
  const tagText = (image.tags ?? [])
    .map((tag) => `${tag?.name ?? ""}`.toLowerCase())
    .join(" ");
  const combined = `${source} ${title} ${creator} ${category} ${tagText}`;

  const syntheticSignals =
    /\b(ai|a\.?i\.?|generated|midjourney|stable diffusion|dall[- ]?e|render|cgi|3d|illustration|illustrated|vector|clipart|cartoon|drawing|painting|watercolor|sketch|icon|logo|mockup)\b/;

  if (syntheticSignals.test(combined)) {
    return false;
  }

  return true;
}
