/**
 * LLM-based bill tag enrichment.
 *
 * Pairs with `classify.ts` (API-first classifier). Where the API gives us a
 * single LoC Policy Area for a bill, this module asks Claude Haiku for up to
 * 2 additional LoC labels that should also apply, with the API tag treated as
 * a non-negotiable anchor (always kept, never overridden).
 *
 * Output is hard-validated against the active taxonomy via `canonicalizeValue`.
 */

import { callBedrockStructured } from "../bedrock-structured";
import { isBedrockConfigured } from "../aws-bedrock";
import {
  canonicalizeValue,
  encodeTerm,
  getActiveTaxonomy,
} from "./index";

export interface BillLLMClassificationInput {
  title: string;
  /** Canonicalized LoC Policy Area from the Congress.gov API, if available. */
  apiAnchor?: string | null;
}

export interface BillLLMClassificationResult {
  /** Encoded LoC tags. Includes apiAnchor (if provided) as the first element. */
  topicTags: string[];
  source: "llm" | "unavailable" | "error";
  reasoning?: string;
}

const MAX_TOTAL_LABELS = 3;

interface ToolOutput {
  labels: string[];
  reasoning: string;
}

export async function classifyBillFromTitle(
  input: BillLLMClassificationInput
): Promise<BillLLMClassificationResult> {
  if (!isBedrockConfigured()) {
    // Anchor alone if we can't reach Bedrock.
    if (input.apiAnchor) {
      const def = getActiveTaxonomy();
      return {
        topicTags: [encodeTerm(def.id, input.apiAnchor)],
        source: "unavailable",
      };
    }
    return { topicTags: [], source: "unavailable" };
  }

  const def = getActiveTaxonomy();
  const prompt = buildPrompt(input);

  try {
    const parsed = await callBedrockStructured<ToolOutput>({
      prompt,
      toolName: "classify_bill",
      toolDescription:
        "Pick the LoC Policy Area labels that best describe this U.S. Congressional bill",
      inputSchema: {
        type: "object",
        properties: {
          labels: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: MAX_TOTAL_LABELS,
            description:
              "LoC Policy Area labels, exact spelling/casing from the controlled vocabulary",
          },
          reasoning: {
            type: "string",
            description: "One sentence explaining the choices",
          },
        },
        required: ["labels", "reasoning"],
        additionalProperties: false,
      },
      maxTokens: 512,
      temperature: 0,
    });

    const validated = (parsed.labels ?? [])
      .map((label) => canonicalizeValue(def, label))
      .filter((v): v is string => Boolean(v));

    // API anchor first (forced inclusion), then dedup-merge LLM additions, cap at 3.
    const merged: string[] = [];
    if (input.apiAnchor) merged.push(input.apiAnchor);
    for (const v of validated) {
      if (merged.includes(v)) continue;
      merged.push(v);
      if (merged.length >= MAX_TOTAL_LABELS) break;
    }

    return {
      topicTags: merged.map((v) => encodeTerm(def.id, v)),
      source: "llm",
      reasoning: parsed.reasoning,
    };
  } catch (e) {
    console.error("[classifyBillFromTitle] Bedrock error:", e);
    if (input.apiAnchor) {
      return {
        topicTags: [encodeTerm(def.id, input.apiAnchor)],
        source: "error",
      };
    }
    return { topicTags: [], source: "error" };
  }
}

function buildPrompt(input: BillLLMClassificationInput): string {
  const def = getActiveTaxonomy();
  const vocabularyBlock = def.terms
    .map((term) => {
      const desc = def.descriptions[term] ?? "";
      return `- ${term}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");

  const anchorBlock = input.apiAnchor
    ? `\nThe Congress.gov API has already labeled this bill as "${input.apiAnchor}". That label is correct and MUST appear in your "labels" output. You may add up to 2 additional labels if (and only if) the title clearly aligns with them. Prefer fewer high-confidence additions over speculative ones.\n`
    : `\nNo API label is available. Pick the 1-${MAX_TOTAL_LABELS} labels that best describe this bill from the title alone.\n`;

  return `You are classifying a U.S. Congressional bill against the Library of Congress Policy Area taxonomy.

Bill title:
${input.title}
${anchorBlock}
You MUST choose ONLY from this exact list of ${def.terms.length} ${def.displayName} labels. Use the EXACT spelling and casing shown. Do not invent new labels and do not paraphrase:

${vocabularyBlock}`;
}
