/**
 * AWS Bedrock structured-output helper.
 *
 * Two implementations behind a single dispatcher:
 *
 *   1. Tool-use coercion (callBedrockStructuredToolUse) — for Bedrock models
 *      that DO NOT natively constrain output to a JSON schema. We hand the
 *      schema as a forced-tool-use definition; the model emits a tool_use
 *      block whose `input` is decoded as JSON. Brittle on some models
 *      (notably Nova Lite on resolutions: "Model produced invalid sequence
 *      as part of ToolUse").
 *
 *   2. Native structured output (callBedrockStructuredNative) — for Bedrock
 *      models that DO natively constrain output via Converse
 *      `outputConfig.textFormat` (Feb 2026 GA). The model is constrained at
 *      decode time; the JSON-conformant string lands in a plain text content
 *      block.
 *
 * The exported `callBedrockStructured` dispatches by model family prefix,
 * so callers (lib/summarize.ts, scripts/regenerate-summary-0507-nova.ts)
 * don't need to know which path is in use — just pass `--model <id>` and
 * the right path is taken.
 *
 * Refs:
 *   https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-inference-call.html
 *   https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

export interface CallBedrockStructuredOptions {
  prompt: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema (the body that goes inside `inputSchema.json`). */
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /** Override the default model from env. */
  modelId?: string;
}

function getModelId(override?: string): string {
  return (
    override ||
    process.env.AWS_BEDROCK_MODEL ||
    "amazon.nova-lite-v1:0"
  );
}

function newClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
}

// --- Native structured-output detection --------------------------------------

// Bedrock model families that natively support JSON-schema-constrained output
// via Converse `outputConfig.textFormat` (Feb 2026 GA). Match by family prefix
// because each family ships under many fully-qualified IDs (different version
// stamps + optional `us.` cross-region inference profile prefix). Strip `us.`
// first, then check startsWith. Add a family here only after confirming with
// scripts/debug-native-output.ts that the model actually constrains output.
//
// OpenAI gpt-oss-* is intentionally NOT listed: in our testing, gpt-oss on
// Bedrock burns the entire token budget on `reasoningContent` (reasoning_effort
// in additionalModelRequestFields had no effect) and the JSON it does emit is
// not schema-constrained — it arrives wrapped in ```json``` fences. Treat it
// as a tool-use-only model on Bedrock until AWS lands real schema decoding.
const NATIVE_STRUCTURED_OUTPUT_MODEL_PREFIXES: readonly string[] = [
  "anthropic.claude-haiku-4-5",
  "anthropic.claude-sonnet-4-5",
  "anthropic.claude-opus-4-5",
];

export function supportsNativeStructuredOutput(modelId: string): boolean {
  const id = modelId.startsWith("us.") ? modelId.slice(3) : modelId;
  return NATIVE_STRUCTURED_OUTPUT_MODEL_PREFIXES.some((p) => id.startsWith(p));
}

// Bedrock native structured output rejects these JSON Schema keywords:
// minLength/maxLength/minItems/maxItems, recursive $ref, if/then/else.
// Strip them from a deep clone before sending. Tool-use path keeps originals.
const STRIP_KEYS_FOR_NATIVE = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);

function sanitizeSchemaForNative(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForNative);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (STRIP_KEYS_FOR_NATIVE.has(k)) continue;
      out[k] = sanitizeSchemaForNative(v);
    }
    return out;
  }
  return schema;
}

// --- Path 1: tool-use coercion -----------------------------------------------

export async function callBedrockStructuredToolUse<T>(
  opts: CallBedrockStructuredOptions
): Promise<T> {
  const client = newClient();

  const command = new ConverseCommand({
    modelId: getModelId(opts.modelId),
    messages: [{ role: "user", content: [{ text: opts.prompt }] }],
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
    },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: opts.toolName,
            description: opts.toolDescription,
            // Bedrock typing uses smithy DocumentType (recursive); JSON Schema
            // conforms but the structural-type check rejects Record<string, unknown>.
            inputSchema: { json: opts.inputSchema as never },
          },
        },
      ],
      toolChoice: { tool: { name: opts.toolName } },
    },
  });

  const response = await client.send(command);
  const blocks = response.output?.message?.content ?? [];
  const toolUse = blocks.find(
    (b: { toolUse?: { input?: unknown } }) => b.toolUse !== undefined
  );
  if (!toolUse?.toolUse?.input) {
    throw new Error(
      `Bedrock returned no toolUse block for tool "${opts.toolName}"`
    );
  }
  return toolUse.toolUse.input as T;
}

// --- Path 2: native structured output ---------------------------------------

export async function callBedrockStructuredNative<T>(
  opts: CallBedrockStructuredOptions
): Promise<T> {
  const client = newClient();
  const modelId = getModelId(opts.modelId);

  const input: ConverseCommandInput = {
    modelId,
    messages: [{ role: "user", content: [{ text: opts.prompt }] }],
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0,
    },
    outputConfig: {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: {
            name: opts.toolName,
            description: opts.toolDescription,
            // Bedrock Converse requires the schema as a JSON-encoded STRING
            // (asymmetric with InvokeModel, where it's a nested object).
            schema: JSON.stringify(sanitizeSchemaForNative(opts.inputSchema)),
          },
        },
      },
    },
  };

  const response = await client.send(new ConverseCommand(input));
  // OpenAI gpt-oss and reasoning-enabled Claude models emit reasoningContent
  // blocks ahead of the final text block, so don't assume index 0.
  const blocks = response.output?.message?.content ?? [];
  const textBlock = blocks.find(
    (b: { text?: string }) => typeof b.text === "string" && b.text.length > 0
  );
  const text = textBlock?.text;
  if (!text) {
    const blockTypes = blocks
      .map((b) => Object.keys(b).join(","))
      .join(" | ");
    throw new Error(
      `Bedrock returned no text content for native structured output (schema "${opts.toolName}", blocks: [${blockTypes}])`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `Bedrock native structured output was not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// --- Dispatcher (public entry point) ----------------------------------------

export async function callBedrockStructured<T>(
  opts: CallBedrockStructuredOptions
): Promise<T> {
  const modelId = getModelId(opts.modelId);
  return supportsNativeStructuredOutput(modelId)
    ? callBedrockStructuredNative<T>({ ...opts, modelId })
    : callBedrockStructuredToolUse<T>({ ...opts, modelId });
}
