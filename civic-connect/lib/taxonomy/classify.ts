/**
 * Bill → LoC Policy Area classifier.
 *
 * Decision tree (strict single-label):
 *   1. API path  — Congress.gov returned `policyArea.name` that canonicalizes
 *                  against the controlled vocab → single tag, source "api".
 *   2. LLM path  — API has no policyArea → ask Bedrock to pick ONE LoC term
 *                  from the title (see lib/taxonomy/classify-bill-llm.ts) →
 *                  single tag, source "llm-fallback". Returns no tag rather
 *                  than guessing when the title is too vague.
 *   3. None      — neither path produced a tag → empty array, source "none".
 *
 * The keyword fallback (inferTopicsFromTitle / KEYWORD_RULES) is no longer in
 * the bill-labeling path. It still exists in lib/taxonomy/index.ts and is used
 * by lib/topics.ts for read-time topic-affinity normalization in
 * recommendations / org matching, which is a separate concern.
 *
 * Multi-label extension on top of an API anchor is deferred — see
 * lib/taxonomy/classify-bill-llm.ts for the FUTURE WORK banner.
 */

import {
  canonicalizeValue,
  encodeTerm,
  getActiveTaxonomy,
} from "./index";
import { classifyBillFallbackFromTitle } from "./classify-bill-llm";

export interface BillClassificationInput {
  policyArea?: string | null;
}

export type ClassificationSource = "api" | "llm-fallback" | "none";

export interface ClassificationResult {
  topicTags: string[];
  source: ClassificationSource;
}

export async function classifyBillTaxonomy(
  detail: BillClassificationInput | null | undefined,
  title: string
): Promise<ClassificationResult> {
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

  const fallback = await classifyBillFallbackFromTitle(title);
  if (fallback.topicTag) {
    return {
      topicTags: [fallback.topicTag],
      source: "llm-fallback",
    };
  }

  return { topicTags: [], source: "none" };
}
