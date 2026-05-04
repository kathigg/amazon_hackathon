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
