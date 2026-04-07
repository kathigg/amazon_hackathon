/**
 * Bill summarization using Vercel AI SDK.
 *
 * Provider is selected via AI_PROVIDER env var:
 *   - "ollama"    → local Ollama (for GPU dev machines)
 *   - "google"    → Gemini (default, free tier available)
 *   - "anthropic" → Claude
 *   - "openai"    → GPT
 *
 * Model is selected via AI_MODEL env var (defaults per provider).
 */

import { generateObject } from "ai";
import { z } from "zod";

export interface BillSummary {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
}

const summarySchema = z.object({
  plainLanguage: z
    .string()
    .describe(
      "3-4 sentence plain English overview of what this bill does, starting with 'This bill would...' or 'This bill...'"
    ),
  keyProvisions: z
    .array(z.string())
    .describe(
      "3-5 bullet points covering major sections, each starting with an action verb"
    ),
  whyItMatters: z
    .string()
    .describe(
      "2-3 sentences on practical impact for everyday Americans, stated neutrally"
    ),
});

function getModel() {
  const provider = process.env.AI_PROVIDER ?? "google";
  const modelName = process.env.AI_MODEL;

  switch (provider) {
    case "ollama": {
      // Ollama exposes an OpenAI-compatible API at /v1
      const { createOpenAI } = require("@ai-sdk/openai");
      const ollamaProvider = createOpenAI({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
        apiKey: "ollama", // required by SDK but unused by Ollama
      });
      return ollamaProvider(modelName ?? "qwen3:0.6b");
    }
    case "google": {
      const { google } = require("@ai-sdk/google");
      return google(modelName ?? "gemini-2.0-flash");
    }
    case "anthropic": {
      const { anthropic } = require("@ai-sdk/anthropic");
      return anthropic(modelName ?? "claude-sonnet-4-20250514");
    }
    case "openai": {
      const { openai } = require("@ai-sdk/openai");
      return openai(modelName ?? "gpt-4o-mini");
    }
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${provider}". Use "ollama", "google", "anthropic", or "openai".`
      );
  }
}

/**
 * BillSum-informed prompt based on findings from:
 * "BillSum: A Corpus for Automatic Summarization of US Legislation" (arXiv 1910.00523)
 *
 * Key principles:
 * - Focus on actions and effects, not procedural/amendment mechanics
 * - Use action verbs (authorizes, prohibits, requires, establishes)
 * - Interpret amendments — explain what changes in practice
 * - Cover the entire bill, not just the beginning (no lead bias)
 * - Consistent 200-300 word length regardless of bill size
 * - Paraphrase legal jargon into everyday language
 */
function buildPrompt(title: string, billText: string): string {
  return `You are a nonpartisan legislative analyst writing for CivicConnect, a civic engagement platform. Your audience is everyday Americans — not lawyers or policy experts.

Summarize this U.S. Congressional bill. Follow these rules strictly:

STYLE:
- Write at an 8th-grade reading level using everyday language
- Be conversational but informative — like explaining to a neighbor what this bill would do
- Use action verbs: "This bill would require...", "It prohibits...", "It establishes..."
- Never editorialize, express opinions, or use politically charged framing

STRUCTURE:
- "plainLanguage": A 3-4 sentence overview of what this bill does and why it was introduced. Start with "This bill would..." or "This bill..." — explain the real-world effect, not the legal mechanics.
- "keyProvisions": 3-5 bullet points covering the major sections. Each provision should be one clear sentence starting with an action verb. Walk through the bill's major parts, not just the first section.
- "whyItMatters": 2-3 sentences on the practical impact for everyday Americans. Who does this affect? What changes in practice? State neutrally without political framing.

IMPORTANT:
- When the bill says "Section X is amended by inserting Y", explain what that CHANGE means in practice — do not quote the amendment instruction.
- Cover the ENTIRE bill, not just the beginning. Important provisions are often in later sections.
- Keep total length around 200-300 words regardless of bill length.

Bill title: "${title}"

Bill text:
${billText}`;
}

export async function summarizeBill(
  title: string,
  billText: string
): Promise<BillSummary & { aiProvider: string; aiModel: string }> {
  const aiProvider = process.env.AI_PROVIDER ?? "google";
  const aiModel = process.env.AI_MODEL ?? "gemini-2.0-flash";
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema: summarySchema,
      prompt: buildPrompt(title, billText),
    });
    return { ...object, aiProvider, aiModel };
  } catch (err) {
    console.error("Summarization failed:", err);
    return {
      plainLanguage: "Summary unavailable.",
      keyProvisions: [],
      whyItMatters: "",
      aiProvider,
      aiModel,
    };
  }
}
