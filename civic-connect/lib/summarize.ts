/**
 * Bill summarization via Bedrock, split into three small calls per bill.
 *
 *   1. plainLanguage  — plain-text Converse, no schema. ~250-350 words.
 *   2. keyProvisions  — tool-use Converse with a 1-field schema, anchored on
 *                       the just-generated plainLanguage + bill text.
 *   3. whyItMatters   — tool-use Converse with a 2-field schema ({why, who}),
 *                       anchored on plainLanguage. The two fields are
 *                       concatenated into the labeled-string DB format that
 *                       lib/bill-summary.ts:splitWhyAndWho expects.
 *
 * Calls 2 & 3 run in parallel after call 1. The split was introduced because
 * Nova Lite's combined three-field tool-use payload failed with "Model
 * produced invalid sequence as part of ToolUse" on certain bills (heavily
 * skewed toward resolutions). Smaller per-call schemas avoid the failure.
 *
 * Model is selected via AWS_BEDROCK_MODEL env var. Both Nova (tool-use
 * coercion) and Claude Haiku 4.5 (native structured output) flow through
 * lib/bedrock-structured.ts:callBedrockStructured; the dispatcher there picks
 * the right path by model family.
 */

import {
  callBedrockStructured,
  callBedrockText,
} from "./bedrock-structured";
import { isBedrockConfigured } from "./aws-bedrock";
import { withTimeout } from "./with-timeout";

export interface BillSummary {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
}

export interface SummarizeBillOptions {
  /**
   * Bypass the withTimeout/circuit-breaker wrapper. Set this when calling
   * from parallel-worker scripts (e.g. scripts/regenerate-summary-0507-nova.ts)
   * that handle their own per-bill error catching — withTimeout opens a
   * process-wide circuit on first failure and would cascade across workers.
   */
  skipTimeout?: boolean;
}

const KEY_PROVISIONS_SCHEMA = {
  type: "object",
  properties: {
    keyProvisions: {
      type: "array",
      items: { type: "string", minLength: 40 },
      minItems: 3,
      maxItems: 5,
      description:
        "3-5 bullets covering major sections of the bill, each one full sentence (>=40 chars) starting with an action verb. Cover the whole bill, not just the first sections.",
    },
  },
  required: ["keyProvisions"],
  additionalProperties: false,
} as const;

const WHY_IT_MATTERS_SCHEMA = {
  type: "object",
  properties: {
    why: {
      type: "string",
      minLength: 200,
      maxLength: 700,
      description:
        "2-4 sentences (~70-100 words) on consequences ONLY — what tangibly changes in daily life, government operations, or markets if this passes. Neutral framing. Do NOT list affected groups here.",
    },
    who: {
      type: "string",
      minLength: 200,
      maxLength: 700,
      description:
        "2-4 sentences (~70-100 words) naming specific groups, ordered most-to-least directly impacted. Name federal agencies in full on first reference (e.g., 'Department of Veterans Affairs'). Be concrete about everyday-person groups (e.g., 'low-income renters in rural counties', 'Medicare beneficiaries over 65'). Avoid vague phrases like 'many Americans'.",
    },
  },
  required: ["why", "who"],
  additionalProperties: false,
} as const;

/**
 * @deprecated Retained for any external callers that imported it; not used
 * by the new three-call orchestration. Will be removed in a future cleanup.
 */
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    plainLanguage: { type: "string", minLength: 1000, maxLength: 2200 },
    keyProvisions: {
      type: "array",
      items: { type: "string", minLength: 40 },
      minItems: 3,
      maxItems: 5,
    },
    whyItMatters: { type: "string", minLength: 500, maxLength: 1400 },
  },
  required: ["plainLanguage", "keyProvisions", "whyItMatters"],
  additionalProperties: false,
} as const;

const STYLE_PREAMBLE = `You are a nonpartisan legislative analyst writing for CivicConnect, a civic engagement platform. Your audience is everyday Americans — not lawyers or policy experts.

STYLE:
- Write at New York Times reading level — clear, modern news prose, slightly formal.
- Use action verbs: "requires", "prohibits", "authorizes", "establishes", "directs the [Agency] to..."
- Name federal agencies in full on first reference (e.g., "Department of Veterans Affairs"); abbreviate after.
- Never editorialize, express opinions, or use politically charged framing.`;

function buildPlainLanguagePrompt(title: string, billText: string): string {
  return `${STYLE_PREAMBLE}

TASK: Write a three-paragraph plain-language summary of this U.S. Congressional bill, following the Congressional Research Service pattern: existing law -> what changes -> downstream effects.

STRUCTURE (THREE PARAGRAPHS, ~250-350 words total, separated by a blank line):
- Paragraph 1 (~80-110 words): the relevant current law or status quo this bill operates against. If the bill creates something new rather than amending existing law, describe the problem the bill is responding to instead.
- Paragraph 2 (~80-110 words): what this bill changes. Lead with the responsible agency or actor, then the action, then the core mechanism.
- Paragraph 3 (~80-110 words): how the change plays out in practice — implementation timeline, funding source, downstream effects on existing programs or markets.

IMPORTANT:
- When the bill says "Section X is amended by inserting Y", explain what that CHANGE means in practice — do not quote the amendment instruction.
- Cover the ENTIRE bill, not just the beginning. Important provisions are often in later sections.
- Avoid "text-like" words that describe the document rather than its effects: estimate, average, report, rise, section, finish, percent, debate.

OUTPUT INSTRUCTIONS:
- Output ONLY the three paragraphs, separated by a single blank line.
- Do NOT include any preamble like "Here is the summary:".
- Do NOT include headings or labels.
- Begin your response with the first word of paragraph one.

Bill title: "${title}"

Bill text:
${billText}`;
}

function buildKeyProvisionsPrompt(
  title: string,
  billText: string,
  plainLanguage: string
): string {
  return `${STYLE_PREAMBLE}

TASK: Identify 3-5 key provisions of this bill — the major sections that drive its substantive effects. Cover the whole bill, not just the first sections.

REQUIREMENTS:
- Each provision is one full sentence (>=40 chars) starting with an action verb.
- Walk the entire bill; later sections often contain the most consequential provisions.
- Be specific about the responsible agency, the timeline, or the dollar amount when the bill names them.

Plain-language summary of this bill (already generated):

${plainLanguage}

Bill title: "${title}"

Full bill text:
${billText}`;
}

function buildWhyItMattersPrompt(
  title: string,
  plainLanguage: string
): string {
  return `${STYLE_PREAMBLE}

TASK: Given the plain-language summary below, write two short sections answering "why does this bill matter" and "who does it affect".

CONTENT GUIDANCE:
- The "why" field is consequences ONLY — what tangibly changes in daily life, government operations, or markets if this passes. Neutral framing. Do NOT list affected groups here.
- The "who" field names specific groups, ordered most-to-least directly impacted. Be concrete (e.g., "low-income renters in rural counties", "Medicare beneficiaries over 65", "dairy farmers in the Upper Midwest"). Avoid vague phrases like "many Americans".
- Each field is 2-4 sentences (~70-100 words).

Bill title: "${title}"

Plain-language summary:

${plainLanguage}`;
}

/**
 * @deprecated Retained for external callers; the orchestrator no longer uses
 * this. New code should not call buildPrompt — use summarizeBill instead.
 */
export function buildPrompt(title: string, billText: string): string {
  return buildPlainLanguagePrompt(title, billText);
}

async function generatePlainLanguage(
  title: string,
  billText: string
): Promise<string> {
  return callBedrockText({
    prompt: buildPlainLanguagePrompt(title, billText),
    maxTokens: 2400,
    temperature: 0.2,
  });
}

async function generateKeyProvisions(
  title: string,
  billText: string,
  plainLanguage: string
): Promise<string[]> {
  const result = await callBedrockStructured<{ keyProvisions: string[] }>({
    prompt: buildKeyProvisionsPrompt(title, billText, plainLanguage),
    toolName: "submit_key_provisions",
    toolDescription: "Submit 3-5 key provisions of this bill",
    inputSchema: KEY_PROVISIONS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1200,
    temperature: 0.2,
  });
  return result.keyProvisions;
}

async function generateWhyItMatters(
  title: string,
  plainLanguage: string
): Promise<string> {
  const { why, who } = await callBedrockStructured<{
    why: string;
    who: string;
  }>({
    prompt: buildWhyItMattersPrompt(title, plainLanguage),
    toolName: "submit_why_it_matters",
    toolDescription: "Submit the why-it-matters and who-it-affects sections",
    inputSchema: WHY_IT_MATTERS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1000,
    temperature: 0.2,
  });
  // Concatenate to the existing labeled-string DB format so splitWhyAndWho
  // (lib/bill-summary.ts:24) and BillSummaryPanel keep working unchanged.
  return `WHY THIS MATTERS:\n${why.trim()}\n\nWHO THIS AFFECTS:\n${who.trim()}`;
}

const FALLBACK: BillSummary = {
  plainLanguage: "Summary unavailable.",
  keyProvisions: [],
  whyItMatters: "",
};
const SUMMARY_TIMEOUT_MS = Number(process.env.SUMMARY_TIMEOUT_MS ?? 60_000);

export async function summarizeBill(
  title: string,
  billText: string,
  options: SummarizeBillOptions = {}
): Promise<BillSummary & { aiProvider: string; aiModel: string }> {
  const aiProvider = "bedrock";
  const aiModel =
    process.env.AWS_BEDROCK_MODEL ||
    "amazon.nova-lite-v1:0";

  if (!isBedrockConfigured()) {
    return { ...FALLBACK, aiProvider, aiModel };
  }

  const run = async (): Promise<BillSummary | null> => {
    try {
      const plainLanguage = await generatePlainLanguage(title, billText);
      const [keyProvisions, whyItMatters] = await Promise.all([
        generateKeyProvisions(title, billText, plainLanguage),
        generateWhyItMatters(title, plainLanguage),
      ]);
      return { plainLanguage, keyProvisions, whyItMatters };
    } catch (err) {
      if (options.skipTimeout) throw err;
      console.error("Summarization failed:", err);
      return null;
    }
  };

  const summary = options.skipTimeout
    ? await run()
    : await withTimeout<BillSummary | null>(run, SUMMARY_TIMEOUT_MS, null);

  if (!summary) {
    return { ...FALLBACK, aiProvider, aiModel };
  }
  return { ...summary, aiProvider, aiModel };
}
