import { encodeTerm, parseTerm } from "@/lib/taxonomy";

type AccountInterestDefinition = {
  id: string;
  label: string;
  blurb: string;
  topicTags: readonly string[];
};

const LOC = (name: string) => encodeTerm("loc-policy-area", name);

export const ACCOUNT_INTERESTS = [
  {
    id: "gun-policy",
    label: "Gun Policy",
    blurb: "Firearms rules, background checks, and public safety policy.",
    topicTags: [LOC("Crime and Law Enforcement")],
  },
  {
    id: "environmental-policy",
    label: "Environmental Policy",
    blurb: "Climate, clean energy, pollution, and conservation.",
    topicTags: [LOC("Environmental Protection"), LOC("Energy")],
  },
  {
    id: "abortion-reproductive-rights",
    label: "Abortion",
    blurb: "Reproductive rights, maternal care, and access to treatment.",
    topicTags: [LOC("Health"), LOC("Civil Rights and Liberties, Minority Issues")],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    blurb: "Insurance, prescription drugs, hospitals, and care access.",
    topicTags: [LOC("Health")],
  },
  {
    id: "economy-and-taxes",
    label: "Economy & Taxes",
    blurb: "Inflation, federal spending, taxes, debt, and trade.",
    topicTags: [
      LOC("Economics and Public Finance"),
      LOC("Taxation"),
      LOC("Finance and Financial Sector"),
    ],
  },
  {
    id: "immigration-and-border",
    label: "Immigration",
    blurb: "Asylum, border policy, visas, and citizenship.",
    topicTags: [LOC("Immigration")],
  },
  {
    id: "education",
    label: "Education",
    blurb: "Schools, student aid, higher education, and curriculum fights.",
    topicTags: [LOC("Education")],
  },
  {
    id: "housing-cost-of-living",
    label: "Housing",
    blurb: "Rent, homeownership, zoning, and affordability pressure.",
    topicTags: [
      LOC("Housing and Community Development"),
      LOC("Economics and Public Finance"),
    ],
  },
  {
    id: "technology-and-privacy",
    label: "Tech & Privacy",
    blurb: "AI, internet rules, data privacy, and platform regulation.",
    topicTags: [
      LOC("Science, Technology, Communications"),
      LOC("Civil Rights and Liberties, Minority Issues"),
    ],
  },
  {
    id: "foreign-policy",
    label: "Foreign Policy",
    blurb: "Wars, alliances, sanctions, diplomacy, and global strategy.",
    topicTags: [
      LOC("International Affairs"),
      LOC("Armed Forces and National Security"),
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "Transit, roads, bridges, water systems, and broadband.",
    topicTags: [LOC("Transportation and Public Works")],
  },
  {
    id: "agriculture-and-food",
    label: "Agriculture",
    blurb: "Farm policy, food systems, rural development, and subsidies.",
    topicTags: [LOC("Agriculture and Food")],
  },
] as const satisfies readonly AccountInterestDefinition[];

export type AccountInterestSelection = (typeof ACCOUNT_INTERESTS)[number]["id"];

const INTEREST_BASELINE_WEIGHT = 5;

const interestLookup = new Map(
  ACCOUNT_INTERESTS.map((interest) => [interest.id, interest])
);

export function normalizeTopicWeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const weights: Record<string, number> = {};

  for (const [topic, rawWeight] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawWeight !== "number" || !Number.isFinite(rawWeight) || rawWeight <= 0) {
      continue;
    }
    // Lazily migrate stale legacy keys (e.g. "Healthcare") into encoded LoC form
    // (e.g. "loc-policy-area:Health"). parseTerm() resolves both via aliases.
    const parsed = parseTerm(topic);
    const canonicalKey = parsed
      ? encodeTerm(parsed.taxonomy, parsed.value)
      : topic;
    weights[canonicalKey] = Math.max(weights[canonicalKey] ?? 0, rawWeight);
  }

  return weights;
}

export function sanitizeInterestSelections(values: readonly string[]): AccountInterestSelection[] {
  const selections = new Set<AccountInterestSelection>();

  for (const value of values) {
    if (interestLookup.has(value as AccountInterestSelection)) {
      selections.add(value as AccountInterestSelection);
    }
  }

  return Array.from(selections);
}

export function getInterestTopicWeights(
  selections: readonly string[]
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const selection of sanitizeInterestSelections(selections)) {
    const interest = interestLookup.get(selection);

    if (!interest) {
      continue;
    }

    for (const topic of interest.topicTags) {
      weights[topic] = Math.max(weights[topic] ?? 0, INTEREST_BASELINE_WEIGHT);
    }
  }

  return weights;
}

export function mergeTopicWeights(
  storedWeights: unknown,
  interestSelections: readonly string[]
): Record<string, number> {
  const merged = normalizeTopicWeights(storedWeights);

  for (const [topic, weight] of Object.entries(
    getInterestTopicWeights(interestSelections)
  )) {
    merged[topic] = Math.max(merged[topic] ?? 0, weight);
  }

  return merged;
}
