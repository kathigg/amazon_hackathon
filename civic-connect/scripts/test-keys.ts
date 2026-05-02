#!/usr/bin/env tsx
/**
 * Test configured external credentials with live requests.
 * Run with: node --import tsx scripts/test-keys.ts
 */

import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function logPresence(name: string, value: string | undefined) {
  console.log(`${value ? "✅" : "❌"} ${name}: ${value ? "Set" : "Missing"}`);
}

async function testDatabase(): Promise<CheckResult> {
  const prisma = new PrismaClient({ log: ["error"] });
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    return { name: "DATABASE_URL", ok: true, detail: "Connected and executed SELECT 1" };
  } catch (error: any) {
    return { name: "DATABASE_URL", ok: false, detail: error.message || "Connection failed" };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function testCongressApi(): Promise<CheckResult> {
  if (!process.env.CONGRESS_API_KEY) {
    return { name: "CONGRESS_API_KEY", ok: false, detail: "Missing" };
  }

  try {
    const response = await fetch(
      `https://api.congress.gov/v3/bill/119?limit=1&api_key=${process.env.CONGRESS_API_KEY}`
    );

    if (!response.ok) {
      return {
        name: "CONGRESS_API_KEY",
        ok: false,
        detail: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    return { name: "CONGRESS_API_KEY", ok: true, detail: "HTTP 200 from Congress API" };
  } catch (error: any) {
    return { name: "CONGRESS_API_KEY", ok: false, detail: error.message || "Request failed" };
  }
}

async function testGoogleCivicApi(): Promise<CheckResult> {
  if (!process.env.GOOGLE_CIVIC_API_KEY) {
    return { name: "GOOGLE_CIVIC_API_KEY", ok: false, detail: "Missing" };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/civicinfo/v2/representatives?address=1600+Pennsylvania+Ave+NW+Washington+DC&key=${process.env.GOOGLE_CIVIC_API_KEY}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        name: "GOOGLE_CIVIC_API_KEY",
        ok: false,
        detail: `HTTP ${response.status}: ${errorText.substring(0, 160)}`,
      };
    }

    return {
      name: "GOOGLE_CIVIC_API_KEY",
      ok: true,
      detail: "HTTP 200 from Google Civic API",
    };
  } catch (error: any) {
    return { name: "GOOGLE_CIVIC_API_KEY", ok: false, detail: error.message || "Request failed" };
  }
}

async function testGeminiApi(): Promise<CheckResult> {
  if (!process.env.GOOGLE_GEMINI_KEY) {
    return { name: "GOOGLE_GEMINI_KEY", ok: false, detail: "Missing" };
  }

  try {
    const client = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_KEY);
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Reply with exactly OK.");
    const text = result.response.text();
    return {
      name: "GOOGLE_GEMINI_KEY",
      ok: true,
      detail: `Gemini responded: ${JSON.stringify(text)}`,
    };
  } catch (error: any) {
    return { name: "GOOGLE_GEMINI_KEY", ok: false, detail: error.message || "Request failed" };
  }
}

async function testAnthropicApi(): Promise<CheckResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { name: "ANTHROPIC_API_KEY", ok: false, detail: "Missing" };
  }

  try {
    const modelName =
      process.env.AI_PROVIDER === "anthropic"
        ? process.env.AI_MODEL || "claude-haiku-4-5-20251001"
        : "claude-haiku-4-5-20251001";

    const result = await generateText({
      model: anthropic(modelName),
      prompt: "Reply with exactly OK.",
      maxOutputTokens: 10,
    });

    return {
      name: "ANTHROPIC_API_KEY",
      ok: true,
      detail: `Anthropic responded: ${JSON.stringify(result.text)}`,
    };
  } catch (error: any) {
    return { name: "ANTHROPIC_API_KEY", ok: false, detail: error.message || "Request failed" };
  }
}

async function testBedrockApi(): Promise<CheckResult> {
  if (
    !process.env.AWS_REGION ||
    !process.env.AWS_BEDROCK_MODEL ||
    !(
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    )
  ) {
    return {
      name: "AWS_BEDROCK",
      ok: false,
      detail: "Missing AWS_REGION, AWS_BEDROCK_MODEL, or any valid Bedrock auth method",
    };
  }

  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION,
    });

    const command = new ConverseCommand({
      modelId: process.env.AWS_BEDROCK_MODEL,
      messages: [
        {
          role: "user",
          content: [{ text: "Reply with exactly OK." }],
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

    return {
      name: "AWS_BEDROCK",
      ok: true,
      detail: `Bedrock responded: ${JSON.stringify(text && "text" in text ? text.text : null)}`,
    };
  } catch (error: any) {
    return { name: "AWS_BEDROCK", ok: false, detail: error.message || "Request failed" };
  }
}

async function testKeys() {
  console.log("🔑 Testing configured credentials...\n");

  console.log("Presence check:");
  logPresence("DATABASE_URL", process.env.DATABASE_URL);
  logPresence("CONGRESS_API_KEY", process.env.CONGRESS_API_KEY);
  logPresence("GOOGLE_CIVIC_API_KEY", process.env.GOOGLE_CIVIC_API_KEY);
  logPresence("GOOGLE_GEMINI_KEY", process.env.GOOGLE_GEMINI_KEY);
  logPresence("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  logPresence("AWS_BEARER_TOKEN_BEDROCK", process.env.AWS_BEARER_TOKEN_BEDROCK);
  logPresence("AWS_ACCESS_KEY_ID", process.env.AWS_ACCESS_KEY_ID);
  logPresence("AWS_SECRET_ACCESS_KEY", process.env.AWS_SECRET_ACCESS_KEY);
  logPresence("AWS_REGION", process.env.AWS_REGION);
  logPresence("AWS_BEDROCK_MODEL", process.env.AWS_BEDROCK_MODEL);
  logPresence("INGEST_SECRET", process.env.INGEST_SECRET);
  logPresence("CRON_SECRET", process.env.CRON_SECRET);
  console.log(`✅ AI_PROVIDER: ${process.env.AI_PROVIDER || "Missing"}`);
  console.log(`✅ AI_MODEL: ${process.env.AI_MODEL || "Missing"}`);

  const results = await Promise.all([
    testDatabase(),
    testCongressApi(),
    testGoogleCivicApi(),
    testGeminiApi(),
    testAnthropicApi(),
    testBedrockApi(),
  ]);

  console.log("\nLive checks:");
  for (const result of results) {
    console.log(`${result.ok ? "✅" : "❌"} ${result.name}: ${result.detail}`);
  }

  console.log("\nNotes:");
  console.log("- INGEST_SECRET and CRON_SECRET are internal shared secrets, so this script only verifies presence.");
  console.log("- AI_PROVIDER and AI_MODEL are exercised indirectly by the Anthropic test when AI_PROVIDER=anthropic.");

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\n❌ ${failed.length} live check(s) failed.`);
    process.exit(1);
  }

  console.log("\n✅ All live credential checks passed!");
}

testKeys();
