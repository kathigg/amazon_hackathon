import manifest from "../public/topic-images-real/manifest.json";
import { parseTerm } from "./taxonomy";

export type BillImageCategorySlug =
  | "rights-justice"
  | "health-welfare"
  | "economy"
  | "environment-land"
  | "infrastructure-energy"
  | "defense-foreign"
  | "knowledge-culture"
  | "government";

type CategoryConfig = {
  slug: BillImageCategorySlug;
  label: string;
  terms: string[];
  manifestKeys: string[];
};

const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    slug: "rights-justice",
    label: "Rights & Justice",
    terms: [
      "Civil Rights and Liberties, Minority Issues",
      "Crime and Law Enforcement",
      "Law",
      "Native Americans",
      "Immigration",
    ],
    manifestKeys: ["immigration", "security", "housing", "general"],
  },
  {
    slug: "health-welfare",
    label: "Health & Welfare",
    terms: ["Health", "Social Welfare", "Families", "Social Sciences and History"],
    manifestKeys: ["healthcare", "housing", "education", "general"],
  },
  {
    slug: "economy",
    label: "Economy",
    terms: [
      "Economics and Public Finance",
      "Finance and Financial Sector",
      "Commerce",
      "Foreign Trade and International Finance",
      "Taxation",
      "Labor and Employment",
    ],
    manifestKeys: ["economy", "tax", "general"],
  },
  {
    slug: "environment-land",
    label: "Environment & Land",
    terms: [
      "Environmental Protection",
      "Public Lands and Natural Resources",
      "Water Resources Development",
      "Animals",
      "Agriculture and Food",
    ],
    manifestKeys: ["energy", "general", "transportation"],
  },
  {
    slug: "infrastructure-energy",
    label: "Infrastructure & Energy",
    terms: [
      "Transportation and Public Works",
      "Energy",
      "Housing and Community Development",
    ],
    manifestKeys: ["transportation", "energy", "housing"],
  },
  {
    slug: "defense-foreign",
    label: "Defense & Foreign",
    terms: [
      "Armed Forces and National Security",
      "International Affairs",
      "Emergency Management",
    ],
    manifestKeys: ["security", "general", "transportation"],
  },
  {
    slug: "knowledge-culture",
    label: "Knowledge & Culture",
    terms: [
      "Education",
      "Science, Technology, Communications",
      "Arts, Culture, Religion",
      "Sports and Recreation",
    ],
    manifestKeys: ["education", "technology", "general"],
  },
  {
    slug: "government",
    label: "Government",
    terms: ["Government Operations and Politics", "Congress"],
    manifestKeys: ["general", "security", "economy"],
  },
];

const CATEGORY_BY_TERM = new Map(
  CATEGORY_CONFIG.flatMap((category) =>
    category.terms.map((term) => [term, category] as const)
  )
);

const IMAGE_MANIFEST = manifest as Record<string, string[]>;
const LOCAL_TOPIC_KEYS = new Set([
  "immigration",
  "economy",
  "transportation",
  "security",
  "technology",
  "energy",
  "general",
  "healthcare",
  "education",
  "tax",
  "housing",
]);
const GENERAL_FALLBACK =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/US_Capitol_dome_Jan_2006.jpg/1280px-US_Capitol_dome_Jan_2006.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail";

export function getBillImageRecord(
  billId: string,
  topicTags: readonly string[]
): {
  categorySlug: BillImageCategorySlug;
  categoryLabel: string;
  imageUrl: string;
} {
  const category = resolveBillImageCategory(topicTags);
  const pool = getCategoryImagePool(category);
  const imageUrl =
    pool.length > 0 ? pool[hashString(`${billId}::${category.slug}`) % pool.length] : GENERAL_FALLBACK;

  return {
    categorySlug: category.slug,
    categoryLabel: category.label,
    imageUrl,
  };
}

export function resolveBillImageCategory(topicTags: readonly string[]) {
  for (const storedTag of topicTags) {
    const parsed = parseTerm(storedTag);
    const category = parsed ? CATEGORY_BY_TERM.get(parsed.value) : null;
    if (category) {
      return category;
    }
  }

  for (const storedTag of topicTags) {
    const category = resolveCategoryFromLooseTag(storedTag);
    if (category) {
      return category;
    }
  }

  return CATEGORY_CONFIG.find((category) => category.slug === "government")!;
}

function getCategoryImagePool(category: CategoryConfig) {
  const remoteImages = category.manifestKeys
    .flatMap((key) => IMAGE_MANIFEST[key] ?? [])
    .filter((value) => Boolean(value));
  const localFallbacks = category.manifestKeys.flatMap(getLocalTopicImages);
  const primary = Array.from(new Set([...remoteImages, ...localFallbacks]));
  if (primary.length > 0) {
    return primary;
  }
  return [...(IMAGE_MANIFEST.general ?? []), ...getLocalTopicImages("general")];
}

function getLocalTopicImages(key: string) {
  if (!LOCAL_TOPIC_KEYS.has(key)) {
    return [];
  }

  return [1, 2, 3].map((index) => `/topic-images/${key}/${key}-${index}.svg`);
}

function resolveCategoryFromLooseTag(storedTag: string) {
  const tag = storedTag.toLowerCase();
  const match = CATEGORY_CONFIG.find((category) =>
    category.terms.some((term) => tag.includes(term.toLowerCase()))
  );
  if (match) {
    return match;
  }

  if (/(immigration|border|citizenship|visa|asylum|refugee)/.test(tag)) {
    return findCategory("rights-justice");
  }
  if (/(health|medicare|medicaid|hospital|drug|veteran|social welfare)/.test(tag)) {
    return findCategory("health-welfare");
  }
  if (/(tax|finance|econom|commerce|labor|employment|trade|business)/.test(tag)) {
    return findCategory("economy");
  }
  if (/(environment|public land|water|forest|wildfire|species|agriculture|food)/.test(tag)) {
    return findCategory("environment-land");
  }
  if (/(infrastructure|transport|energy|housing|rail|road|waterway)/.test(tag)) {
    return findCategory("infrastructure-energy");
  }
  if (/(defense|military|security|foreign|emergency|armed forces)/.test(tag)) {
    return findCategory("defense-foreign");
  }
  if (/(education|school|science|technology|communication|privacy|broadband|arts|culture)/.test(tag)) {
    return findCategory("knowledge-culture");
  }
  if (/(government|congress|election|politics|agency|federal)/.test(tag)) {
    return findCategory("government");
  }

  return null;
}

function findCategory(slug: BillImageCategorySlug) {
  return CATEGORY_CONFIG.find((category) => category.slug === slug)!;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
