export const TOPIC_TAGS = [
  "Healthcare",
  "Economy",
  "Environment",
  "Education",
  "Immigration",
  "Defense",
  "Infrastructure",
  "Civil Rights",
  "Technology",
  "Housing",
  "Agriculture",
  "Foreign Policy",
] as const;

export type TopicTag = (typeof TOPIC_TAGS)[number];

const RAW_TOPIC_HINTS: Array<{ tag: TopicTag; matches: string[] }> = [
  {
    tag: "Healthcare",
    matches: ["health", "medicare", "medicaid", "drug", "hospital", "public health"],
  },
  {
    tag: "Economy",
    matches: ["tax", "budget", "finance", "financial", "commerce", "labor", "employment", "small business"],
  },
  {
    tag: "Environment",
    matches: ["environment", "public lands", "natural resources", "energy", "conservation", "wildlife"],
  },
  {
    tag: "Education",
    matches: ["education", "school", "student", "college", "university"],
  },
  {
    tag: "Immigration",
    matches: ["immigration", "border", "asylum", "citizenship", "migrant"],
  },
  {
    tag: "Defense",
    matches: ["armed forces", "military", "veteran", "national security", "defense"],
  },
  {
    tag: "Infrastructure",
    matches: ["transportation", "public works", "bridge", "highway", "transit", "broadband", "water resources"],
  },
  {
    tag: "Civil Rights",
    matches: ["civil rights", "liberties", "justice", "crime", "law enforcement", "elections", "government operations"],
  },
  {
    tag: "Technology",
    matches: ["technology", "communications", "cyber", "internet", "privacy", "artificial intelligence", "data"],
  },
  {
    tag: "Housing",
    matches: ["housing", "community development", "homeless"],
  },
  {
    tag: "Agriculture",
    matches: ["agriculture", "farm", "food", "rural"],
  },
  {
    tag: "Foreign Policy",
    matches: ["foreign", "international", "treaty", "diplomatic", "sanction"],
  },
];

// Keyword-based topic inference for bills without explicit tags
const TOPIC_KEYWORDS: Record<TopicTag, string[]> = {
  Healthcare: ["health", "medicare", "medicaid", "drug", "hospital", "medical", "insurance"],
  Economy: ["tax", "budget", "fiscal", "economic", "trade", "tariff", "finance", "debt"],
  Environment: ["climate", "environment", "energy", "emission", "clean", "pollution", "carbon"],
  Education: ["education", "school", "student", "college", "university", "learning"],
  Immigration: ["immigration", "border", "asylum", "visa", "citizenship", "migrant"],
  Defense: ["defense", "military", "army", "navy", "veteran", "national security"],
  Infrastructure: ["infrastructure", "highway", "bridge", "broadband", "transit", "water"],
  "Civil Rights": ["civil rights", "discrimination", "equality", "voting rights", "justice"],
  Technology: ["technology", "cyber", "artificial intelligence", "data", "privacy", "internet"],
  Housing: ["housing", "rent", "mortgage", "homeless", "affordable"],
  Agriculture: ["agriculture", "farm", "food", "crop", "rural"],
  "Foreign Policy": ["foreign", "diplomatic", "treaty", "sanction", "international"],
};

export function inferTopics(title: string): TopicTag[] {
  const lower = title.toLowerCase();
  return TOPIC_TAGS.filter((tag) =>
    TOPIC_KEYWORDS[tag].some((kw) => lower.includes(kw))
  );
}

export function normalizeTopicTag(value: string): TopicTag | null {
  const cleaned = value
    .replace(/^[a-z-]+:/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  const exactMatch = TOPIC_TAGS.find(
    (tag) => tag.toLowerCase() === cleaned.toLowerCase()
  );

  if (exactMatch) {
    return exactMatch;
  }

  const lower = cleaned.toLowerCase();
  const match = RAW_TOPIC_HINTS.find((hint) =>
    hint.matches.some((candidate) => lower.includes(candidate))
  );

  return match?.tag ?? null;
}

export function normalizeTopicTags(
  values: readonly string[],
  title?: string
): TopicTag[] {
  const normalized = new Set<TopicTag>();

  for (const value of values) {
    const topic = normalizeTopicTag(value);
    if (topic) {
      normalized.add(topic);
    }
  }

  for (const inferred of inferTopics(title ?? "")) {
    normalized.add(inferred);
  }

  return Array.from(normalized);
}

export function formatTopicTag(value: string) {
  const normalized = normalizeTopicTag(value);
  if (normalized) {
    return normalized;
  }

  return value
    .replace(/^[a-z-]+:/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}
