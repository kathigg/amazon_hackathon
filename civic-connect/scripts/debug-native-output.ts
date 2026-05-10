/**
 * Diagnostic: invoke Bedrock Converse with outputConfig.textFormat against
 * a given model and dump the raw response to understand what's coming back.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/debug-native-output.ts <modelId>
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

const modelId = process.argv[2] || "openai.gpt-oss-20b-1:0";

const SCHEMA = {
  type: "object",
  properties: {
    plainLanguage: { type: "string" },
    keyProvisions: { type: "array", items: { type: "string" } },
    whyItMatters: { type: "string" },
  },
  required: ["plainLanguage", "keyProvisions", "whyItMatters"],
  additionalProperties: false,
};

const PROMPT =
  'Summarize this bill: "A bill to designate the post office at 123 Main St as the John Doe Post Office Building." Use only 100-200 words. Output your answer as JSON with fields plainLanguage, keyProvisions (array of strings), whyItMatters.';

async function main() {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

  const input: ConverseCommandInput = {
    modelId,
    messages: [{ role: "user", content: [{ text: PROMPT }] }],
    inferenceConfig: { maxTokens: 1024, temperature: 0 },
    outputConfig: {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: {
            name: "submit_summary",
            description: "Bill summary",
            schema: JSON.stringify(SCHEMA),
          },
        },
      },
    },
  };

  console.log("=== REQUEST ===");
  console.log(JSON.stringify(input, null, 2));
  console.log();

  const t0 = Date.now();
  let response;
  try {
    response = await client.send(new ConverseCommand(input));
  } catch (err) {
    console.log(`ERROR after ${Date.now() - t0}ms:`);
    console.log(err);
    process.exit(1);
  }
  console.log(`=== RESPONSE (${Date.now() - t0}ms) ===`);
  console.log(JSON.stringify(response, null, 2));
}

main();
