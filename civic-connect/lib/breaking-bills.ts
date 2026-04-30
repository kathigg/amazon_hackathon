const MAJOR_ACTION_PATTERNS = [
  "passed house",
  "passed senate",
  "agreed to in house",
  "agreed to in senate",
  "house agreed to senate",
  "senate agreed to house",
  "presented to president",
  "signed by president",
  "became public law",
  "became private law",
  "vetoed by president",
];

export const BREAKING_WINDOW_MS = 30 * 60 * 1000;

export function isMajorBillAction(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  const normalized = status.toLowerCase();

  if (normalized.includes("introduced") || normalized.includes("referred to")) {
    return false;
  }

  return MAJOR_ACTION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getBreakingCutoff(now = new Date()): Date {
  return new Date(now.getTime() - BREAKING_WINDOW_MS);
}

export function getBreakingExpiresAt(breakingAt: Date): Date {
  return new Date(breakingAt.getTime() + BREAKING_WINDOW_MS);
}

export function getBreakingKey(billId: string, breakingAt: string | Date): string {
  const keyDate =
    breakingAt instanceof Date ? breakingAt.toISOString() : new Date(breakingAt).toISOString();

  return `${billId}:${keyDate}`;
}
