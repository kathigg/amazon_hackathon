/**
 * AWS Bedrock Integration for LLM Analysis
 * Uses Amazon Nova through AWS Bedrock to analyze representative stances
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { sanitizeRepresentativeReasoning } from "./representative-reasoning";

interface BedrockConfig {
  region: string;
  model: string;
}

export async function analyzeStance(
  repName: string,
  billTitle: string,
  publicRecordContent: string,
  sourceUrl?: string | null
): Promise<{
  stance: "strong_support" | "possible_support" | "neutral" | "possible_reject" | "strong_reject";
  confidence: number;
  reasoning: string;
}> {
  const config = getBedrockConfig();

  const prompt = `You are analyzing a U.S. representative's stance on a bill.

Representative: ${repName}
Bill: ${billTitle}
Official website/source URL: ${sourceUrl ?? "Not available"}

Public record content from the representative's official website:
${publicRecordContent.substring(0, 4000)}

Based on this content, determine their stance on this specific bill. Consider:
1. Explicit statements about the bill
2. General policy positions that relate to the bill's topic
3. Past voting record on similar issues
4. Party affiliation and typical positions

Respond in JSON format:
{
  "stance": "strong_support" | "possible_support" | "neutral" | "possible_reject" | "strong_reject",
  "confidence": 0.0-1.0,
  "reasoning": "Complete factual sentences explaining the public evidence. If the stance is strong_support, cite the most specific official statement, release, vote, sponsorship, or policy action available and include the official URL when available."
}

Rules:
- Prefer explicit public statements and official releases over vague partisan assumptions.
- If you mention support or opposition, name the evidence: a vote, a statement, a press release, or a clearly related policy push.
- For strong_support, require explicit evidence such as a direct statement, sponsorship, cosponsorship, vote, or official release. Otherwise use possible_support or neutral.
- Focus on empirical public facts about the representative. Do not describe internal collection methods.
- Do not use the words scraped, scraping, crawler, dataset, or database in the reasoning.
- Write complete sentences only. Do not stop midway through a sentence.
- If the evidence is weak or indirect, return neutral or possible support/opposition with lower confidence.
- If there's no relevant information, return neutral with low confidence and say there is no clear public position yet.`;

  try {
    const response = await callBedrock(config, prompt);
    const parsed = JSON.parse(response) as {
      stance: "strong_support" | "possible_support" | "neutral" | "possible_reject" | "strong_reject";
      confidence: number;
      reasoning: string;
    };

    return {
      ...parsed,
      reasoning:
        sanitizeRepresentativeReasoning(parsed.reasoning) ??
        "No clear public position yet.",
    };
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
      maxTokens: 1400,
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
    model: process.env.AWS_BEDROCK_MODEL || "amazon.nova-lite-v1:0",
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
