/**
 * AWS Bedrock Integration for LLM Analysis
 * Uses Claude via AWS Bedrock to analyze representative stances
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

interface BedrockConfig {
  region: string;
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
  "reasoning": "One or two sentences max, citing a specific public statement, official release, vote, or lack of evidence"
}

Rules:
- Prefer explicit public statements and official releases over vague partisan assumptions.
- If you mention support or opposition, name the evidence: a vote, a statement, a press release, or a clearly related policy push.
- If the evidence is weak or indirect, return neutral or possible support/opposition with lower confidence.
- If there's no relevant information, return neutral with low confidence and say there is no clear public position yet.`;

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
  });

  const command = new ConverseCommand({
    modelId: config.model,
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 1024,
    },
  });

  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find(
    (item) => "text" in item && typeof item.text === "string"
  );

  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Bedrock returned no text content");
  }

  return textBlock.text;
}

function getBedrockConfig(): BedrockConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    model: process.env.AWS_BEDROCK_MODEL || "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  };
}

export function isBedrockConfigured(): boolean {
  return !!(
    process.env.AWS_REGION &&
    (
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    )
  );
}
