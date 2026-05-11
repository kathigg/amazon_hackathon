/**
 * Bedrock Titan Multimodal G1 v1 wrapper.
 *
 * Used at ingest (text → bill embedding) and during the one-time image-pool
 * curation pass (image → asset embedding). Never called on the request path —
 * the resulting embeddings are persisted on `Bill.topicEmbedding` and
 * `BillImageAsset.embedding`.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID = "amazon.titan-embed-image-v1";
const OUTPUT_DIM = 1024;

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return cachedClient;
}

interface TitanResponse {
  embedding?: number[];
  message?: string;
}

async function invokeTitan(body: Record<string, unknown>): Promise<number[]> {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      ...body,
      embeddingConfig: { outputEmbeddingLength: OUTPUT_DIM },
    }),
  });
  const response = await getClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as TitanResponse;
  if (!parsed.embedding || parsed.embedding.length !== OUTPUT_DIM) {
    throw new Error(
      `Titan returned no embedding (or wrong dim): ${parsed.message ?? "unknown"}`
    );
  }
  return parsed.embedding;
}

export async function embedImage(bytes: Buffer): Promise<number[]> {
  return invokeTitan({ inputImage: bytes.toString("base64") });
}

// amazon.titan-embed-image-v1 caps inputText at ~128 tokens (~500 chars).
// Longer input is silently truncated server-side; this slice just avoids
// wasted bytes on the wire and keeps the cost predictable.
const MAX_TEXT_CHARS = 500;

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("embedText: empty input");
  }
  return invokeTitan({ inputText: trimmed.slice(0, MAX_TEXT_CHARS) });
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const EMBEDDING_DIM = OUTPUT_DIM;
