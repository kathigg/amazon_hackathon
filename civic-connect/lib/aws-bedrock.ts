/**
 * AWS Bedrock Integration for LLM Analysis
 * Uses Claude via AWS Bedrock to analyze representative stances
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

interface BedrockConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  model: string;
}

export async function analyzeStance(
  repName: string,
  billTitle: string,
  scrapedContent: string
): Promise<{
  stance: "strong_support" | "possible_support" | "neutral" | "possible_reject" | "strong_reject";
  confidence: number;
  reasoning: string;
}> {
  const config = getBedrockConfig();

  const prompt = `You are analyzing a U.S. representative's stance on a bill.

Representative: ${repName}
Bill: ${billTitle}

Scraped content from their website:
${scrapedContent.substring(0, 4000)}

Based on this content, determine their stance on this specific bill. Consider:
1. Explicit statements about the bill
2. General policy positions that relate to the bill's topic
3. Past voting record on similar issues
4. Party affiliation and typical positions

Respond in JSON format:
{
  "stance": "strong_support" | "possible_support" | "neutral" | "possible_reject" | "strong_reject",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}

If there's no relevant information, return neutral with low confidence.`;

  try {
    const response = await callBedrock(config, prompt);
    return JSON.parse(response);
  } catch (error) {
    console.error("Bedrock analysis error:", error);
    return {
      stance: "neutral",
      confidence: 0,
      reasoning: "Analysis failed",
    };
  }
}

async function callBedrock(config: BedrockConfig, prompt: string): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: config.model,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  return responseBody.content[0].text;
}

function getBedrockConfig(): BedrockConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    model: process.env.AWS_BEDROCK_MODEL || "us.anthropic.claude-haiku-4-5-20250110-v1:0",
  };
}

export function isBedrockConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );
}
