import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  canonicalizeValue,
  encodeTerm,
  getActiveTaxonomy,
} from "./index";
import { isBedrockConfigured } from "../aws-bedrock";

export interface OrgClassificationInput {
  name?: string;
  mission: string;
}

export interface OrgClassificationResult {
  /** Encoded taxonomy terms (e.g. "loc-policy-area:Health"). Empty array if classifier unavailable or no labels matched. */
  topicTags: string[];
  source: "llm" | "unavailable" | "error";
  /** Free-text reasoning from the model, useful for debugging and UI tooltip. */
  reasoning?: string;
}

const MAX_LABELS = 5;

export async function classifyOrgMission(
  input: OrgClassificationInput
): Promise<OrgClassificationResult> {
  if (!isBedrockConfigured()) {
    return { topicTags: [], source: "unavailable" };
  }

  const def = getActiveTaxonomy();
  const prompt = buildPrompt(def, input);

  try {
    const raw = await callBedrock(prompt);
    const parsed = parseModelResponse(raw);
    const validated = parsed.labels
      .map((label) => canonicalizeValue(def, label))
      .filter((v): v is string => Boolean(v));
    const unique = Array.from(new Set(validated)).slice(0, MAX_LABELS);
    return {
      topicTags: unique.map((v) => encodeTerm(def.id, v)),
      source: "llm",
      reasoning: parsed.reasoning,
    };
  } catch (e) {
    console.error("[classifyOrgMission] Bedrock error:", e);
    return { topicTags: [], source: "error" };
  }
}

function buildPrompt(
  def: ReturnType<typeof getActiveTaxonomy>,
  input: OrgClassificationInput
): string {
  const vocabularyBlock = def.terms
    .map((term) => {
      const desc = def.descriptions[term] ?? "";
      return `- ${term}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");

  const orgHeader = input.name ? `Organization: ${input.name}\n` : "";

  return `You are classifying a U.S. advocacy organization against the Library of Congress Policy Area taxonomy.

${orgHeader}Mission statement:
${input.mission}

Pick the 1-${MAX_LABELS} Policy Areas that best describe this organization's actual focus. Only pick a label if the mission clearly aligns with it. Prefer fewer high-confidence labels over many speculative ones.

You MUST choose ONLY from this exact list of ${def.terms.length} ${def.displayName} labels. Use the EXACT spelling and casing shown. Do not invent new labels, do not paraphrase, and do not use labels from any other taxonomy:

${vocabularyBlock}

Respond with ONLY a JSON object in this exact shape (no markdown, no commentary outside the JSON):
{
  "labels": ["<exact label 1>", "<exact label 2>"],
  "reasoning": "One sentence explaining your choices."
}

If the mission is too vague or off-topic to classify, return {"labels": [], "reasoning": "<why>"}.`;
}

interface ParsedResponse {
  labels: string[];
  reasoning?: string;
}

function parseModelResponse(raw: string): ParsedResponse {
  // Strip optional code-fence wrapper.
  const stripped = raw.trim().replace(/^```(?:json)?\s*|```$/g, "").trim();
  // Find the first JSON object in the response.
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { labels: [] };
  }
  const slice = stripped.slice(start, end + 1);
  let obj: unknown;
  try {
    obj = JSON.parse(slice);
  } catch {
    return { labels: [] };
  }
  if (!obj || typeof obj !== "object") return { labels: [] };
  const labelsRaw = (obj as { labels?: unknown }).labels;
  const reasoning = (obj as { reasoning?: unknown }).reasoning;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((l): l is string => typeof l === "string")
    : [];
  return {
    labels,
    reasoning: typeof reasoning === "string" ? reasoning : undefined,
  };
}

export interface NormalizationInput {
  unknownLabels: string[];
  name?: string;
  mission?: string;
}

export interface NormalizationResult {
  /** Encoded LoC terms produced by mapping the unknowns. May be empty if no good matches. */
  topicTags: string[];
  source: "llm" | "unavailable" | "error";
  reasoning?: string;
}

/**
 * Map caller-submitted strings that aren't in the active taxonomy onto the
 * closest valid labels, using the org's name/mission as disambiguation context
 * when available. The model is shown the controlled vocab and instructed to
 * return only matches from it; output is hard-validated post-hoc.
 */
export async function normalizeUnknownLabels(
  input: NormalizationInput
): Promise<NormalizationResult> {
  if (input.unknownLabels.length === 0) {
    return { topicTags: [], source: "llm" };
  }
  if (!isBedrockConfigured()) {
    return { topicTags: [], source: "unavailable" };
  }

  const def = getActiveTaxonomy();
  const prompt = buildNormalizationPrompt(def, input);

  try {
    const raw = await callBedrock(prompt);
    const parsed = parseModelResponse(raw);
    const validated = parsed.labels
      .map((label) => canonicalizeValue(def, label))
      .filter((v): v is string => Boolean(v));
    const unique = Array.from(new Set(validated)).slice(0, MAX_LABELS);
    return {
      topicTags: unique.map((v) => encodeTerm(def.id, v)),
      source: "llm",
      reasoning: parsed.reasoning,
    };
  } catch (e) {
    console.error("[normalizeUnknownLabels] Bedrock error:", e);
    return { topicTags: [], source: "error" };
  }
}

function buildNormalizationPrompt(
  def: ReturnType<typeof getActiveTaxonomy>,
  input: NormalizationInput
): string {
  const vocabularyBlock = def.terms
    .map((term) => {
      const desc = def.descriptions[term] ?? "";
      return `- ${term}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");

  const contextLines: string[] = [];
  if (input.name) contextLines.push(`Organization: ${input.name}`);
  if (input.mission) contextLines.push(`Mission: ${input.mission}`);
  const contextBlock =
    contextLines.length > 0
      ? `\nContext (use this to disambiguate the labels below):\n${contextLines.join("\n")}\n`
      : "";

  const unknownsBlock = input.unknownLabels
    .map((u, i) => `${i + 1}. "${u}"`)
    .join("\n");

  return `You are normalizing a list of free-form topic labels onto the Library of Congress Policy Area taxonomy.

The user submitted these labels for a U.S. advocacy organization, but they are NOT in the controlled vocabulary:
${unknownsBlock}
${contextBlock}
For EACH submitted label, pick the 1-2 ${def.displayName} labels that best capture the same intent. If a submitted label has no reasonable match in the controlled vocab, omit it. Combine all matches across all submitted labels into ONE deduplicated list of at most ${MAX_LABELS} labels.

You MUST choose ONLY from this exact list of ${def.terms.length} ${def.displayName} labels. Use the EXACT spelling and casing shown. Do not invent new labels and do not paraphrase:

${vocabularyBlock}

Respond with ONLY a JSON object in this exact shape (no markdown, no commentary outside the JSON):
{
  "labels": ["<exact label 1>", "<exact label 2>"],
  "reasoning": "One sentence explaining the mapping."
}

If none of the submitted labels have any reasonable match, return {"labels": [], "reasoning": "<why>"}.`;
}

async function callBedrock(prompt: string): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const modelId =
    process.env.AWS_BEDROCK_MODEL ||
    "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const command = new ConverseCommand({
    modelId,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 512, temperature: 0 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find(
    (item: { text?: unknown }) => "text" in item && typeof item.text === "string"
  );
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Bedrock returned no text content");
  }
  return textBlock.text as string;
}
