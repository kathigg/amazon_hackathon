/**
 * Summarizes a bill using Ollama (local) with optional Gemini fallback.
 * Ollama endpoint: http://localhost:11434/api/generate
 * Model: OLLAMA_MODEL env var (default: llama3.2)
 * Fallback: GOOGLE_GEMINI_KEY if set and Ollama unavailable
 */

export interface BillSummary {
  plainLanguage: string;
  keyProvisions: string[];
  whyItMatters: string;
}

const PROMPT = (title: string, text: string) =>
  `You are a nonpartisan legislative analyst. Summarize U.S. Congressional bills in plain English at an 8th-grade reading level. Be factual, neutral, and concise. Never editorialize or express opinions.

Summarize this bill titled "${title}". Return ONLY valid JSON with exactly these fields, no markdown, no explanation:
{
  "plainLanguage": "2-3 sentence plain English summary of what this bill does",
  "keyProvisions": ["provision 1", "provision 2", "provision 3"],
  "whyItMatters": "1-2 sentences explaining the real-world impact on everyday Americans, stated neutrally without political framing"
}

Bill text:
${text.slice(0, 24000)}`;

function parseResponse(text: string): BillSummary {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { plainLanguage: "Summary unavailable.", keyProvisions: [], whyItMatters: "" };
  try {
    const parsed = JSON.parse(match[0]) as BillSummary;
    return {
      plainLanguage: parsed.plainLanguage ?? "Summary unavailable.",
      keyProvisions: Array.isArray(parsed.keyProvisions) ? parsed.keyProvisions : [],
      whyItMatters: parsed.whyItMatters ?? "",
    };
  } catch {
    return { plainLanguage: "Summary unavailable.", keyProvisions: [], whyItMatters: "" };
  }
}

async function summarizeWithOllama(title: string, billText: string): Promise<BillSummary> {
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";
  const endpoint = process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434";

  const res = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: PROMPT(title, billText),
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json() as { response: string };
  return parseResponse(data.response);
}

async function summarizeWithGemini(title: string, billText: string): Promise<BillSummary> {
  const apiKey = process.env.GOOGLE_GEMINI_KEY;
  if (!apiKey || apiKey === "your_gemini_key_here") {
    return { plainLanguage: "Summary unavailable (no API key).", keyProvisions: [], whyItMatters: "" };
  }
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(PROMPT(title, billText));
  return parseResponse(result.response.text());
}

export async function summarizeBill(
  title: string,
  billText: string
): Promise<BillSummary> {
  // Try Ollama first (local, free)
  try {
    return await summarizeWithOllama(title, billText);
  } catch (err) {
    console.warn("Ollama unavailable, falling back to Gemini:", err);
  }

  // Fallback to Gemini if key is set
  try {
    return await summarizeWithGemini(title, billText);
  } catch (err) {
    console.error("Gemini fallback also failed:", err);
    return { plainLanguage: "Summary unavailable.", keyProvisions: [], whyItMatters: "" };
  }
}
