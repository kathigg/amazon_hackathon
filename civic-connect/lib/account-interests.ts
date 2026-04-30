import type { TopicTag } from "@/lib/topics";

type AccountInterestDefinition = {
  id: string;
  label: string;
  blurb: string;
  topicTags: readonly TopicTag[];
};

export const ACCOUNT_INTERESTS = [
  {
    id: "gun-policy",
    label: "Gun Policy",
    blurb: "Firearms rules, background checks, and public safety policy.",
    topicTags: ["Civil Rights"],
  },
  {
    id: "environmental-policy",
    label: "Environmental Policy",
    blurb: "Climate, clean energy, pollution, and conservation.",
    topicTags: ["Environment"],
  },
  {
    id: "abortion-reproductive-rights",
    label: "Abortion",
    blurb: "Reproductive rights, maternal care, and access to treatment.",
    topicTags: ["Healthcare", "Civil Rights"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    blurb: "Insurance, prescription drugs, hospitals, and care access.",
    topicTags: ["Healthcare"],
  },
  {
    id: "economy-and-taxes",
    label: "Economy & Taxes",
    blurb: "Inflation, federal spending, taxes, debt, and trade.",
    topicTags: ["Economy"],
  },
  {
    id: "immigration-and-border",
    label: "Immigration",
    blurb: "Asylum, border policy, visas, and citizenship.",
    topicTags: ["Immigration"],
  },
  {
    id: "education",
    label: "Education",
    blurb: "Schools, student aid, higher education, and curriculum fights.",
    topicTags: ["Education"],
  },
  {
    id: "housing-cost-of-living",
    label: "Housing",
    blurb: "Rent, homeownership, zoning, and affordability pressure.",
    topicTags: ["Housing", "Economy"],
  },
  {
    id: "technology-and-privacy",
    label: "Tech & Privacy",
    blurb: "AI, internet rules, data privacy, and platform regulation.",
    topicTags: ["Technology", "Civil Rights"],
  },
  {
    id: "foreign-policy",
    label: "Foreign Policy",
    blurb: "Wars, alliances, sanctions, diplomacy, and global strategy.",
    topicTags: ["Foreign Policy", "Defense"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "Transit, roads, bridges, water systems, and broadband.",
    topicTags: ["Infrastructure"],
  },
  {
    id: "agriculture-and-food",
    label: "Agriculture",
    blurb: "Farm policy, food systems, rural development, and subsidies.",
    topicTags: ["Agriculture"],
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
    if (typeof rawWeight === "number" && Number.isFinite(rawWeight) && rawWeight > 0) {
      weights[topic] = rawWeight;
    }
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
