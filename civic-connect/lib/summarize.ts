/**
 * Bill summarization using Bedrock Claude Haiku via forced tool-use for
 * schema-validated structured output.
 *
 * Model is selected via AWS_BEDROCK_MODEL env var, defaulting to
 * us.anthropic.claude-haiku-4-5-20251001-v1:0.
 */

import { callBedrockStructured } from "./bedrock-structured";
import { isBedrockConfigured } from "./aws-bedrock";
import { withTimeout } from "./with-timeout";

export interface BillSummary {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    plainLanguage: {
      type: "string",
      description:
        "5-6 sentence plain-English overview of what this bill does, why it matters, and who it affects, written in a slightly formal newspaper style and starting with 'This bill would...' or 'This bill...'",
    },
    keyProvisions: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
      description:
        "3-5 bullet points covering major sections, each starting with an action verb",
    },
    whyItMatters: {
      type: "string",
      description:
        "2-4 sentences on practical impact for everyday Americans, stated neutrally, explicitly naming who is affected and why the change matters in practice",
    },
  },
  required: ["plainLanguage", "keyProvisions", "whyItMatters"],
  additionalProperties: false,
} as const;

/**
 * BillSum-informed prompt based on findings from:
 * "BillSum: A Corpus for Automatic Summarization of US Legislation" (arXiv 1910.00523)
 */
function buildPrompt(title: string, billText: string): string {
  return `You are a nonpartisan legislative analyst writing for CivicConnect, a civic engagement platform. Your audience is everyday Americans — not lawyers or policy experts.

Summarize this U.S. Congressional bill. Follow these rules strictly:

STYLE:
- Write in clear, modern news language at roughly a New York Times reading level
- Be direct and readable, but slightly formal — like a concise newspaper explainer, not a casual conversation
- Sound a bit more formal than a typical blog post, while remaining easy to follow
- Use action verbs: "This bill would require...", "It prohibits...", "It establishes..."
- Never editorialize, express opinions, or use politically charged framing

STRUCTURE:
- "plainLanguage": A 5-6 sentence overview of what this bill does, why it matters, and who it impacts. Start with "This bill would..." or "This bill..." — explain the real-world effect, not the legal mechanics.
- "keyProvisions": 3-5 bullet points covering the major sections. Each provision should be one clear sentence starting with an action verb. Walk through the bill's major parts, not just the first section.
- "whyItMatters": 2-4 sentences on the practical impact for everyday Americans. Explicitly answer: Why does this matter? Who does it affect? What changes in practice? Name the affected groups directly. State neutrally without political framing.

IMPORTANT:
- When the bill says "Section X is amended by inserting Y", explain what that CHANGE means in practice — do not quote the amendment instruction.
- Cover the ENTIRE bill, not just the beginning. Important provisions are often in later sections.
- Do not leave "who is affected" implicit. Name the people, agencies, industries, communities, workers, patients, students, taxpayers, or other groups affected.
- Keep total length around 200-300 words regardless of bill length.

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
    "us.anthropic.claude-haiku-4-5-20251001-v1:0";

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
          maxTokens: 1500,
          temperature: 0.2,
        }),
      12_000,
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
