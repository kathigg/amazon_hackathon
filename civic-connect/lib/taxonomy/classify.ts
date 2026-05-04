import {
  canonicalizeValue,
  encodeTerm,
  getActiveTaxonomy,
  inferTopicsFromTitle,
} from "./index";

export interface BillClassificationInput {
  policyArea?: string | null;
}

export interface ClassificationResult {
  topicTags: string[];
  source: "api" | "keyword" | "none";
}

export function classifyBillTaxonomy(
  detail: BillClassificationInput | null | undefined,
  title: string
): ClassificationResult {
  const def = getActiveTaxonomy();

  if (detail?.policyArea) {
    const canonical = canonicalizeValue(def, detail.policyArea);
    if (canonical) {
      return {
        topicTags: [encodeTerm(def.id, canonical)],
        source: "api",
      };
    }
  }

  const inferred = inferTopicsFromTitle(title);
  if (inferred.length > 0) {
    return { topicTags: inferred, source: "keyword" };
  }

  return { topicTags: [], source: "none" };
}
