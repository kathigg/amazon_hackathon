const INTERNAL_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bscraped website content\b/gi, "public record"],
  [/\bscraped content\b/gi, "public record"],
  [/\bscraped from\b/gi, "published on"],
  [/\bscraping\b/gi, "public record review"],
  [/\bscraped\b/gi, "publicly available"],
  [/\bcrawler\b/gi, "public record review"],
  [/\bdataset\b/gi, "public record"],
  [/\bdatabase\b/gi, "public record"],
];

export function sanitizeRepresentativeReasoning(
  reasoning?: string | null
): string | null {
  if (!reasoning) {
    return null;
  }

  let sanitized = reasoning.replace(/\s+/g, " ").trim();

  for (const [pattern, replacement] of INTERNAL_TERM_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  sanitized = sanitized.trim();

  if (!sanitized) {
    return null;
  }

  return removeIncompleteTrailingSentence(sanitized);
}

function removeIncompleteTrailingSentence(reasoning: string): string | null {
  if (/[.!?]["')\]]?$/.test(reasoning)) {
    return reasoning;
  }

  const lastCompleteSentenceIndex = Math.max(
    reasoning.lastIndexOf("."),
    reasoning.lastIndexOf("!"),
    reasoning.lastIndexOf("?")
  );

  if (lastCompleteSentenceIndex <= 0) {
    if (/\b(because|and|or|but|with|for|to|that|who|which|when|where|while|as|by|on|in|from|of|about|against)$/i.test(reasoning)) {
      return null;
    }

    return `${reasoning}.`;
  }

  return reasoning.slice(0, lastCompleteSentenceIndex + 1).trim();
}
