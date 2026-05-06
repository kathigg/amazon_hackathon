const SUMMARY_PLACEHOLDER = "Summary unavailable.";

export function isSummaryPlaceholder(value?: string | null) {
  return !value || value.trim() === SUMMARY_PLACEHOLDER;
}

export function getSummaryPreview(value?: string | null) {
  if (!value || isSummaryPlaceholder(value)) {
    return null;
  }

  return value.trim();
}
export function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// New summaries emit whyItMatters as two labeled sections separated by a blank
// line: "WHY THIS MATTERS:\n…\n\nWHO THIS AFFECTS:\n…". Older rows have a single
// blob with no delimiter — those return who: null and the caller renders one box.
export function splitWhyAndWho(value: string): { why: string; who: string | null } {
  const match = value.match(
    /^(?:WHY THIS MATTERS:\s*\n)?([\s\S]*?)\n\s*WHO THIS AFFECTS:\s*\n([\s\S]*)$/i
  );
  if (!match) return { why: value.trim(), who: null };
  return { why: match[1].trim(), who: match[2].trim() };
}
