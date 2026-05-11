export const HOME_SEEN_BILLS_COOKIE = "cc_home_seen_bills";
export const HOME_SEEN_BILLS_LIMIT = 180;

const BILL_ID_PATTERN = /^[a-z0-9-]+$/i;

export function parseSeenBillIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const decoded = safeDecode(value);
  const seen = decoded
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id, index, ids) => BILL_ID_PATTERN.test(id) && ids.indexOf(id) === index);

  return seen.slice(-HOME_SEEN_BILLS_LIMIT);
}

export function mergeSeenBillIds(
  previousBillIds: string[],
  nextBillIds: string[],
  limit = HOME_SEEN_BILLS_LIMIT
): string[] {
  const normalizedNext = nextBillIds
    .map((id) => id.trim().toLowerCase())
    .filter((id) => BILL_ID_PATTERN.test(id));
  const nextSet = new Set(normalizedNext);
  const retainedPrevious = previousBillIds.filter((id) => !nextSet.has(id));

  return [...retainedPrevious, ...normalizedNext].slice(-limit);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
