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
    if (!parsed) continue;
    const category = CATEGORY_BY_TERM.get(parsed.value);
    if (category) {
      return category;
    }
  }

  return CATEGORY_CONFIG.find((category) => category.slug === "government")!;
}

function getCategoryImagePool(category: CategoryConfig) {
  const primary = category.manifestKeys
    .flatMap((key) => IMAGE_MANIFEST[key] ?? [])
    .filter((value) => Boolean(value));
  if (primary.length > 0) {
    return Array.from(new Set(primary));
  }
  return IMAGE_MANIFEST.general ?? [];
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
