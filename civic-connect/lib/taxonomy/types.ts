export type TaxonomyId = "loc-policy-area" | "cap" | "loc-subject";

export interface TaxonomyTerm {
  taxonomy: TaxonomyId;
  value: string;
  label: string;
}

export interface TaxonomyGroup {
  label: string;
  terms: readonly string[];
  colorClasses: string;
}

export interface KeywordRule {
  term: string;
  keywords: readonly string[];
}

export interface TaxonomyDefinition {
  id: TaxonomyId;
  displayName: string;
  terms: readonly string[];
  groups: readonly TaxonomyGroup[];
  prioritizedTerms: readonly string[];
  aliases: Readonly<Record<string, string>>;
  keywordRules: readonly KeywordRule[];
  imageQueries: Readonly<Record<string, readonly string[]>>;
  /** One-line scope notes per term, used to teach an LLM classifier what each label covers. */
  descriptions: Readonly<Record<string, string>>;
}
