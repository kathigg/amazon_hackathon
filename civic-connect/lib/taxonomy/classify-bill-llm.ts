/**
 * Bill → LoC Policy Area classification via Bedrock.
 *
 * ACTIVE TODAY: classifyBillFallbackFromTitle()
 *   - Used at ingest time when Congress.gov returns no `policyArea` for a bill
 *     (rare, mostly fresh introductions before LoC has tagged them).
 *   - Asks Bedrock to pick exactly ONE LoC Policy Area from the title alone,
 *     validated against the controlled vocab. May return null when the title
 *     is too vague to classify, in which case the bill is stored with empty
 *     topicTags and topicTagsSource = "none".
 *   - Caller: lib/taxonomy/classify.ts → lib/bill-ingestion.ts.
 *
 * FUTURE WORK: classifyBillFromTitle()
 *   - Multi-label extension on top of an API anchor (anchor + up to 2
 *     LLM-suggested additions, max 3 total). Currently UNWIRED — the
 *     scripts/enrich-bill-tags.ts driver has no npm-script alias.
 *   - Why disabled: the LoC's editorial rule is "one primary subject per
 *     bill," and the current UI does not visually distinguish the
 *     LoC-editorial anchor from model-inferred additions. Until the UI
 *     marks anchor vs. secondary distinctly, multi-label inflates topic
 *     feeds with tangentially-related bills and muddles authority for
 *     everyday viewers. We defer to LoC's single-tag judgment for now.
 *   - To revive: re-add `"enrich:tags": "tsx scripts/enrich-bill-tags.ts"`
 *     to package.json scripts, decide on UI treatment (anchor prominence,
 *     filter-feed inclusion semantics for secondary tags), then run.
 *
 * Output of both functions is hard-validated against the active taxonomy
 * via `canonicalizeValue`.
 */

import { callBedrockStructured } from "../bedrock-structured";
import { isBedrockConfigured } from "../aws-bedrock";
import {
  canonicalizeValue,
  encodeTerm,
  getActiveTaxonomy,
} from "./index";

// ---------------------------------------------------------------------------
// ACTIVE: single-label LLM fallback (used when Congress.gov has no policyArea)
// ---------------------------------------------------------------------------

export interface BillFallbackClassificationResult {
  /** Encoded LoC tag (e.g. "loc-policy-area:Health") or null if no confident match. */
  topicTag: string | null;
  source: "llm-fallback" | "unavailable" | "error";
  reasoning?: string;
}

interface FallbackToolOutput {
  label: string | null;
  reasoning: string;
}

export async function classifyBillFallbackFromTitle(
  title: string
): Promise<BillFallbackClassificationResult> {
  if (!isBedrockConfigured()) {
    return { topicTag: null, source: "unavailable" };
  }

  const def = getActiveTaxonomy();
  const prompt = buildFallbackPrompt(title);

  try {
    const parsed = await callBedrockStructured<FallbackToolOutput>({
      prompt,
      toolName: "classify_bill_fallback",
      toolDescription:
        "Pick the single LoC Policy Area label that best describes this U.S. Congressional bill from its title, or null if the title is too vague",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: ["string", "null"],
            description:
              "ONE LoC Policy Area label from the controlled vocab (exact spelling/casing), or null if no confident match.",
          },
          reasoning: {
            type: "string",
            description: "One sentence explaining the choice.",
          },
        },
        required: ["label", "reasoning"],
        additionalProperties: false,
      },
      maxTokens: 256,
      temperature: 0,
    });

    if (!parsed.label) {
      return { topicTag: null, source: "llm-fallback", reasoning: parsed.reasoning };
    }
    const canonical = canonicalizeValue(def, parsed.label);
    if (!canonical) {
      // Model returned something off-vocab even after the constrained prompt.
      // Treat as no confident match rather than poisoning the column.
      return { topicTag: null, source: "llm-fallback", reasoning: parsed.reasoning };
    }
    return {
      topicTag: encodeTerm(def.id, canonical),
      source: "llm-fallback",
      reasoning: parsed.reasoning,
    };
  } catch (e) {
    console.error("[classifyBillFallbackFromTitle] Bedrock error:", e);
    return { topicTag: null, source: "error" };
  }
}

function buildFallbackPrompt(title: string): string {
  const def = getActiveTaxonomy();
  const vocabularyBlock = def.terms
    .map((term) => {
      const desc = def.descriptions[term] ?? "";
      return `- ${term}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");

  return `You are classifying a U.S. Congressional bill against the Library of Congress Policy Area taxonomy.

The Library of Congress assigns exactly ONE Policy Area per bill, picked as its primary subject. Congress.gov did not return one for this bill (it may be too freshly introduced for LoC to have tagged it yet), so you are filling in for the LoC analyst.

Bill title:
${title}

Pick the SINGLE Policy Area that best describes this bill's primary subject. If the title is so vague or procedural that no single Policy Area is a confident fit (e.g. a generic short-title placeholder with no substantive subject), return null for "label" — it is better to leave the bill untagged than to guess.

You MUST choose ONLY from this exact list of ${def.terms.length} ${def.displayName} labels. Use the EXACT spelling and casing shown. Do not invent new labels and do not paraphrase:

${vocabularyBlock}`;
}

// ---------------------------------------------------------------------------
// FUTURE WORK: multi-label extension on top of an API anchor
// ---------------------------------------------------------------------------
// Currently has no production caller. Driver: scripts/enrich-bill-tags.ts
// (also disabled — npm-script alias removed from package.json). See top-of-
// file banner for the rationale and revival steps.

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
