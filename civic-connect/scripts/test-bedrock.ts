#!/usr/bin/env tsx
/**
 * Test AWS Bedrock configuration and live connectivity
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { isBedrockConfigured } from "../lib/aws-bedrock";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

console.log("🔍 Checking AWS Bedrock configuration...\n");

console.log("Environment variables:");
console.log(`  AWS_BEARER_TOKEN_BEDROCK: ${process.env.AWS_BEARER_TOKEN_BEDROCK ? "✓ Set" : "✗ Missing"}`);
console.log(`  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing"}`);
console.log(`  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing"}`);
console.log(`  AWS_REGION: ${process.env.AWS_REGION || "✗ Missing"}`);
console.log(`  AWS_BEDROCK_MODEL: ${process.env.AWS_BEDROCK_MODEL || "✗ Missing"}`);
console.log(`  CRON_SECRET: ${process.env.CRON_SECRET ? "✓ Set" : "✗ Missing"}`);

console.log(`\nBedrock configured: ${isBedrockConfigured() ? "✅ Yes" : "❌ No"}`);

if (!isBedrockConfigured()) {
  console.log("\n⚠️  Please add AWS credentials to .env.local:");
  console.log("   AWS_BEARER_TOKEN_BEDROCK=your_bedrock_api_key_here");
  console.log("   # or use IAM credentials instead:");
  console.log("   AWS_ACCESS_KEY_ID=your_key_here");
  console.log("   AWS_SECRET_ACCESS_KEY=your_secret_here");
  console.log("   AWS_REGION=us-east-1");
  console.log("   AWS_BEDROCK_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0");
  process.exit(1);
}

async function verifyLiveInvoke() {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION,
  });

  const command = new ConverseCommand({
    modelId: process.env.AWS_BEDROCK_MODEL,
    messages: [
      {
        role: "user",
        content: [{ text: "Reply with exactly the word OK." }],
      },
    ],
    inferenceConfig: {
      maxTokens: 32,
    },
  });

  const response = await client.send(command);
  const text = response.output?.message?.content?.find(
    (item) => "text" in item && typeof item.text === "string"
  );
  return text && "text" in text ? text.text : "";
}

async function main() {
  try {
    console.log("\n🌐 Running live Bedrock invocation...");
    const text = await verifyLiveInvoke();
    console.log(`   Response: ${text}`);
    console.log("\n✅ AWS Bedrock is configured and reachable!");
  } catch (error: any) {
    console.log("\n❌ Live Bedrock invocation failed");
    console.log(`   Error: ${error.name || "Error"}`);
    console.log(`   Message: ${error.message || "Unknown error"}`);
    process.exit(1);
  }
}

main();
