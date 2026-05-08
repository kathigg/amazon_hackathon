/**
 * Bill summarization using Bedrock Nova Micro via forced tool-use for
 * schema-validated structured output.
 *
 * Model is selected via AWS_BEDROCK_MODEL env var, defaulting to
 * amazon.nova-micro-v1:0.
 */

import { callBedrockStructured } from "./bedrock-structured";
import { isBedrockConfigured } from "./aws-bedrock";
import { withTimeout } from "./with-timeout";

export interface BillSummary {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
}

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    plainLanguage: {
      type: "string",
      minLength: 1000,
      maxLength: 2200,
      description:
        "Three paragraphs separated by a blank line (\\n\\n), totaling 250-350 words at New York Times reading level. " +
        "Paragraph 1: the relevant current law or status quo this bill operates against. If the bill creates something new rather than amending existing law, replace this paragraph with a description of the problem the bill is responding to. " +
        "Paragraph 2: what this bill changes — lead with the responsible agency or actor, name the action verbs (requires, prohibits, authorizes, establishes), walk through the core mechanism. " +
        "Paragraph 3: how the change plays out in practice — implementation timeline, funding source, downstream effects on existing programs or markets.",
    },
    keyProvisions: {
      type: "array",
      items: { type: "string", minLength: 40 },
      minItems: 3,
      maxItems: 5,
      description:
        "3-5 bullets covering major sections of the bill, each one full sentence (>=40 chars) starting with an action verb. Cover the whole bill, not just the first sections.",
    },
    whyItMatters: {
      type: "string",
      minLength: 500,
      maxLength: 1400,
      description:
        "ONE string containing two clearly labeled sections, each 3-5 sentences (~70-100 words). Format EXACTLY as:\n\n" +
        "WHY THIS MATTERS:\n<consequences only — what tangibly changes in daily life, government operations, or markets if this passes; state neutrally; do NOT list affected groups here>\n\n" +
        "WHO THIS AFFECTS:\n<specific groups, ordered most-to-least directly impacted; name federal agencies in full on first reference (e.g., 'Department of Veterans Affairs'); be concrete about everyday-person groups (e.g., 'low-income renters in rural counties', 'Medicare beneficiaries over 65'); avoid vague phrases like 'many Americans'>",
    },
  },
  required: ["plainLanguage", "keyProvisions", "whyItMatters"],
  additionalProperties: false,
} as const;

/**
 * BillSum-informed prompt based on findings from:
 * "BillSum: A Corpus for Automatic Summarization of US Legislation" (arXiv 1910.00523)
 *
 * Reference summaries in BillSum (drawn from CRS) average 200-400 words with the
 * California Legislative Counsel pattern recommended in Appendix C.3:
 * existing law -> what changes -> downstream effects.
 */
export function buildPrompt(title: string, billText: string): string {
  return `You are a nonpartisan legislative analyst writing for CivicConnect, a civic engagement platform. Your audience is everyday Americans — not lawyers or policy experts.

Summarize this U.S. Congressional bill following the format used by the Congressional Research Service: action-driven language, named agencies, and explicit reference to existing law where the bill amends it.

STYLE:
- Write at New York Times reading level — clear, modern news prose, slightly formal.
- Use action verbs: "requires", "prohibits", "authorizes", "establishes", "directs the [Agency] to..."
- Name federal agencies in full on first reference (e.g., "Department of Veterans Affairs"); abbreviate after.
- Never editorialize, express opinions, or use politically charged framing.

STRUCTURE FOR plainLanguage (THREE PARAGRAPHS, ~250-350 words total, separated by a blank line):
- Paragraph 1 (~80-110 words): the relevant current law or status quo this bill operates against. If the bill creates something new rather than amending existing law, describe the problem the bill is responding to instead.
- Paragraph 2 (~80-110 words): what this bill changes. Lead with the responsible agency or actor, then the action, then the core mechanism.
- Paragraph 3 (~80-110 words): how the change plays out in practice — implementation timeline, funding source, downstream effects on existing programs or markets.

OTHER FIELDS:
- keyProvisions: 3-5 bullets covering the major sections, each one full sentence starting with an action verb. Walk the whole bill, not just the first sections.
- whyItMatters: ONE string containing two clearly labeled sections separated by a blank line. Format EXACTLY as:

WHY THIS MATTERS:
<3-5 sentences on consequences only — what tangibly changes if this passes; do NOT list affected groups here>

WHO THIS AFFECTS:
<3-5 sentences naming specific groups, ordered most-to-least directly impacted; be concrete (e.g., "dairy farmers in the Upper Midwest", "Medicare beneficiaries 65+"); avoid "many Americans" or other vague framing>

IMPORTANT:
- When the bill says "Section X is amended by inserting Y", explain what that CHANGE means in practice — do not quote the amendment instruction.
- Cover the ENTIRE bill, not just the beginning. Important provisions are often in later sections.
- Avoid "text-like" words that describe the document rather than its effects: estimate, average, report, rise, section, finish, percent, debate.

Bill title: "${title}"

Bill text:
${billText}`;
}

const FALLBACK: BillSummary = {
  plainLanguage: "Summary unavailable.",
  keyProvisions: [],
  whyItMatters: "",
};

export async function summarizeBill(
  title: string,
  billText: string
): Promise<BillSummary & { aiProvider: string; aiModel: string }> {
  const aiProvider = "bedrock";
  const aiModel =
    process.env.AWS_BEDROCK_MODEL ||
    "amazon.nova-micro-v1:0";

  if (!isBedrockConfigured()) {
    return { ...FALLBACK, aiProvider, aiModel };
  }

  try {
    const summary = await withTimeout<BillSummary | null>(
      () =>
        callBedrockStructured<BillSummary>({
          prompt: buildPrompt(title, billText),
          toolName: "submit_summary",
          toolDescription:
            "Submit the structured plain-language summary of this bill",
          inputSchema: SUMMARY_SCHEMA,
          maxTokens: 2400,
          temperature: 0.2,
        }),
      60_000,
      null
    );

    if (!summary) {
      return { ...FALLBACK, aiProvider, aiModel };
    }

    return { ...summary, aiProvider, aiModel };
  } catch (err) {
    console.error("Summarization failed:", err);
    return { ...FALLBACK, aiProvider, aiModel };
  }
}
