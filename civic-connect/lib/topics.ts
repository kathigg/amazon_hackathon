import {
  encodeTerm,
  formatTerm,
  getActiveTaxonomy,
  inferTopicsFromTitle,
  parseTerm,
} from "./taxonomy";

const ACTIVE_TAXONOMY = getActiveTaxonomy();

export const TOPIC_TAGS = [...ACTIVE_TAXONOMY.prioritizedTerms];
export type TopicTag = string;

export function inferTopics(title: string): TopicTag[] {
  return inferTopicsFromTitle(title);
}

export function normalizeTopicTag(value: string): TopicTag | null {
  const parsed = parseTerm(value);
  if (!parsed) {
    return null;
  }

  return encodeTerm(parsed.taxonomy, parsed.value);
}

export function normalizeTopicTags(
  values: readonly string[],
  title?: string
): TopicTag[] {
  const normalized = new Set<string>();

  for (const value of values) {
    const canonical = normalizeTopicTag(value);
    if (canonical) {
      normalized.add(canonical);
    }
  }

  if (title) {
    for (const inferred of inferTopics(title)) {
      normalized.add(inferred);
    }
  }

  return Array.from(normalized);
}

export function formatTopicTag(value: string) {
  return formatTerm(value);
}
