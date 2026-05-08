/**
 * AWS Bedrock structured-output helper.
 *
 * Uses Bedrock Converse + tool-use with a forced toolChoice to coerce the
 * model into emitting JSON conforming to a JSON Schema. The schema is
 * validated by the model at decode time, so callers get typed input back
 * without regex/JSON.parse fallbacks.
 *
 * Canonical pattern: https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-inference-call.html
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
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

export async function callBedrockStructured<T>(
  opts: CallBedrockStructuredOptions
): Promise<T> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

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
