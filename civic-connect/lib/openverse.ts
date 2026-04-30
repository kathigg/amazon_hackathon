const OPENVERSE_IMAGES_ENDPOINT = "https://api.openverse.org/v1/images/";
const OPENVERSE_USER_AGENT = "CivicConnect/0.1 (Openverse bill imagery)";

interface OpenverseImage {
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
}

interface OpenverseImageSearchResponse {
  results?: OpenverseImage[];
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
      "veterans standing in front of american flag",
      "veterans american flag",
    ],
  },
  {
    matches: ["housing", "rent", "mortgage", "homeless", "tenant"],
    queries: ["affordable housing apartment buildings", "housing neighborhood homes"],
  },
  {
    matches: ["climate", "environment", "clean energy", "emissions", "wildfire"],
    queries: ["climate change clean energy", "environment conservation landscape"],
  },
  {
    matches: ["technology", "cyber", "artificial intelligence", "ai", "privacy", "data"],
    queries: ["artificial intelligence circuit board", "technology data network"],
  },
  {
    matches: ["education", "student", "school", "college", "teacher"],
    queries: ["students classroom school", "education books graduation cap"],
  },
  {
    matches: ["immigration", "border", "asylum", "visa", "migrant", "citizenship"],
    queries: ["immigration passport border crossing", "immigration family border"],
  },
  {
    matches: ["infrastructure", "bridge", "highway", "transit", "rail", "airport"],
    queries: ["bridge infrastructure highway", "public transit infrastructure"],
  },
  {
    matches: ["civil rights", "equality", "discrimination", "voting rights", "justice"],
    queries: ["civil rights march protest", "voting rights civic protest"],
  },
  {
    matches: ["economy", "tax", "budget", "trade", "small business", "inflation"],
    queries: ["economy financial district", "small business main street"],
  },
  {
    matches: ["healthcare", "medicare", "medicaid", "medical", "hospital", "drug"],
    queries: ["healthcare hospital medicine", "doctor patient healthcare"],
  },
  {
    matches: ["agriculture", "farm", "crop", "rural", "food"],
    queries: ["farm fields agriculture", "farmer crops rural landscape"],
  },
  {
    matches: ["foreign", "diplomatic", "treaty", "sanction", "international"],
    queries: ["international diplomacy flags", "global diplomacy meeting"],
  },
  {
    matches: ["defense", "military", "national security", "army", "navy", "air force"],
    queries: ["military service members", "national security military"],
  },
] as const;

const TOPIC_QUERY_FALLBACKS: Record<string, string[]> = {
  Healthcare: ["healthcare hospital medicine"],
  Economy: ["economy financial district"],
  Environment: ["environment conservation landscape"],
  Education: ["students classroom school"],
  Immigration: ["immigration passport border crossing"],
  Defense: ["military service members"],
  Infrastructure: ["bridge infrastructure highway"],
  "Civil Rights": ["civil rights march protest"],
  Technology: ["technology data network"],
  Housing: ["affordable housing apartment buildings"],
  Agriculture: ["farm fields agriculture"],
  "Foreign Policy": ["international diplomacy flags"],
};

export async function fetchBestOpenverseBillImage({
  title,
  topicTags,
}: {
  title: string;
  topicTags: string[];
}): Promise<OpenverseBillImage | null> {
  const queries = buildOpenverseQueries(title, topicTags);

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

function buildOpenverseQueries(title: string, topicTags: string[]) {
  const normalizedTitle = title.toLowerCase();
  const queries: string[] = [];

  for (const override of ISSUE_QUERY_OVERRIDES) {
    if (override.matches.some((match) => normalizedTitle.includes(match))) {
      queries.push(...override.queries);
      break;
    }
  }

  for (const topic of topicTags) {
    queries.push(...(TOPIC_QUERY_FALLBACKS[topic] ?? []));
  }

  const titleKeywords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word) && !/^\d+$/.test(word))
    .slice(0, 7)
    .join(" ");

  if (titleKeywords) {
    queries.push(titleKeywords);
    if (topicTags[0]) {
      queries.push(`${topicTags[0].toLowerCase()} ${titleKeywords}`);
    }
  }

  if (queries.length === 0) {
    queries.push("united states policy");
  }

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function isUsableImage(image: OpenverseImage) {
  return Boolean(image.url && image.thumbnail);
}

function scoreImage(image: OpenverseImage) {
  let score = 0;

  if (image.thumbnail) score += 5;
  if (image.creator) score += 2;
  if (image.foreign_landing_url) score += 2;
  if (image.title) score += 1;

  if (image.width && image.height) {
    const ratio = image.width / image.height;
    score += Math.max(0, 3 - Math.abs(1.5 - ratio) * 2);
  }

  return score;
}
