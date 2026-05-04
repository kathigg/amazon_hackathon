import type { TaxonomyDefinition, TaxonomyId, TaxonomyTerm } from "./types";
import { LOC_POLICY_AREA } from "./loc-policy-area";

const registry = new Map<TaxonomyId, TaxonomyDefinition>();

export function registerTaxonomy(def: TaxonomyDefinition): void {
  registry.set(def.id, def);
}

export function getTaxonomy(id: TaxonomyId): TaxonomyDefinition | undefined {
  return registry.get(id);
}

registerTaxonomy(LOC_POLICY_AREA);

export const ACTIVE_TAXONOMY_ID: TaxonomyId = "loc-policy-area";

export function getActiveTaxonomy(): TaxonomyDefinition {
  const def = registry.get(ACTIVE_TAXONOMY_ID);
  if (!def) {
    throw new Error(`Active taxonomy "${ACTIVE_TAXONOMY_ID}" is not registered`);
  }
  return def;
}

export function encodeTerm(taxonomyId: TaxonomyId, value: string): string {
  return `${taxonomyId}:${value}`;
}

export function canonicalizeValue(
  def: TaxonomyDefinition,
  raw: string
): string | null {
  if (!raw) return null;
  if (def.terms.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  const aliased = def.aliases[lower];
  if (aliased && def.terms.includes(aliased)) return aliased;
  const found = def.terms.find((t) => t.toLowerCase() === lower);
  return found ?? null;
}

export function parseTerm(stored: string): TaxonomyTerm | null {
  if (!stored) return null;
  const idx = stored.indexOf(":");
  if (idx > 0) {
    const taxonomyId = stored.slice(0, idx) as TaxonomyId;
    const def = registry.get(taxonomyId);
    if (def) {
      const canonical = canonicalizeValue(def, stored.slice(idx + 1));
      if (!canonical) return null;
      return { taxonomy: taxonomyId, value: canonical, label: canonical };
    }
  }
  // Legacy unprefixed value: try to resolve against the active taxonomy.
  const def = getActiveTaxonomy();
  const canonical = canonicalizeValue(def, stored);
  if (!canonical) return null;
  return { taxonomy: def.id, value: canonical, label: canonical };
}

export function formatTerm(stored: string | null | undefined): string {
  if (!stored) return "";
  const parsed = parseTerm(stored);
  return parsed?.label ?? stored;
}

/**
 * Returns the array of stored variants that should match a UI filter selection.
 * Includes the canonical encoded form plus legacy bare-string variants so
 * pre-backfill rows still surface during the migration window.
 */
export function filterPredicateForTopic(humanTopic: string): string[] {
  const def = getActiveTaxonomy();
  const canonical = canonicalizeValue(def, humanTopic);
  const variants = new Set<string>();
  if (canonical) {
    variants.add(encodeTerm(def.id, canonical));
    variants.add(canonical);
  }
  variants.add(humanTopic);
  return Array.from(variants);
}

const FALLBACK_COLOR = "bg-gray-100 text-gray-700 border border-gray-200";

export function getTermColor(stored: string | null | undefined): string {
  if (!stored) return FALLBACK_COLOR;
  const parsed = parseTerm(stored);
  if (!parsed) return FALLBACK_COLOR;
  const def = getTaxonomy(parsed.taxonomy);
  if (!def) return FALLBACK_COLOR;
  const group = def.groups.find((g) => g.terms.includes(parsed.value));
  return group?.colorClasses ?? FALLBACK_COLOR;
}

/**
 * Keyword-based fallback inference, returning encoded strings ready to persist.
 * Only invoked when the API returns no policyArea for a bill.
 */
export function inferTopicsFromTitle(title: string): string[] {
  const def = getActiveTaxonomy();
  const lower = title.toLowerCase();
  const matches = new Set<string>();
  for (const rule of def.keywordRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      matches.add(encodeTerm(def.id, rule.term));
    }
  }
  return Array.from(matches);
}

export type {
  TaxonomyDefinition,
  TaxonomyId,
  TaxonomyTerm,
  TaxonomyGroup,
  KeywordRule,
} from "./types";
