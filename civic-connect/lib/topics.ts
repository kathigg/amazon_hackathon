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
