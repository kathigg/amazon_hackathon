#!/usr/bin/env tsx
/**
 * Test AWS Bedrock connection
 */

import { isBedrockConfigured } from "../lib/aws-bedrock";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

console.log("🔍 Checking AWS Bedrock configuration...\n");

console.log("Environment variables:");
console.log(`  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing"}`);
console.log(`  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing"}`);
console.log(`  AWS_REGION: ${process.env.AWS_REGION || "✗ Missing"}`);
console.log(`  AWS_BEDROCK_MODEL: ${process.env.AWS_BEDROCK_MODEL || "✗ Missing"}`);
console.log(`  CRON_SECRET: ${process.env.CRON_SECRET ? "✓ Set" : "✗ Missing"}`);

console.log(`\nBedrock configured: ${isBedrockConfigured() ? "✅ Yes" : "❌ No"}`);

if (!isBedrockConfigured()) {
  console.log("\n⚠️  Please add AWS credentials to .env.local:");
  console.log("   AWS_ACCESS_KEY_ID=your_key_here");
  console.log("   AWS_SECRET_ACCESS_KEY=your_secret_here");
  console.log("   AWS_REGION=us-east-1");
  console.log("   AWS_BEDROCK_MODEL=anthropic.claude-3-sonnet-20240229-v1:0");
  process.exit(1);
}

console.log("\n✅ AWS Bedrock is configured and ready!");
