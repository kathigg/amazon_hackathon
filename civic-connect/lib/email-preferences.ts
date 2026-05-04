export const EMAIL_SUBSCRIPTION_OPTIONS = [
  {
    id: "daily",
    label: "Daily",
    blurb: "A 9am local-time briefing with the bills worth reading today.",
  },
  {
    id: "weekly",
    label: "Weekly",
    blurb: "A Monday morning watchlist of the bills and actions that matter most.",
  },
] as const;

export type EmailSubscription = (typeof EMAIL_SUBSCRIPTION_OPTIONS)[number]["id"];
export const DEFAULT_EMAIL_SUBSCRIPTIONS: EmailSubscription[] = ["weekly"];

const subscriptionLookup = new Set<EmailSubscription>(
  EMAIL_SUBSCRIPTION_OPTIONS.map((option) => option.id)
);

export function sanitizeEmailSubscriptions(values: readonly string[]) {
  const selected = new Set<EmailSubscription>();

  for (const value of values) {
    if (subscriptionLookup.has(value as EmailSubscription)) {
      selected.add(value as EmailSubscription);
    }
  }

  return Array.from(selected);
}

export function getInitialEmailSubscriptions(values: readonly string[]) {
  const selected = sanitizeEmailSubscriptions(values);
  return selected.length > 0 ? selected : [...DEFAULT_EMAIL_SUBSCRIPTIONS];
}

export function isValidTimeZone(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getLocalTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
    localDateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}
