export const EMAIL_SUBSCRIPTION_OPTIONS = [
  {
    id: "never",
    label: "Never",
    blurb: "No bill update emails. Your account and representative choices stay saved.",
  },
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
export type StoredEmailSubscription = Exclude<EmailSubscription, "never">;
export const DEFAULT_EMAIL_SUBSCRIPTIONS: StoredEmailSubscription[] = ["weekly"];

export function sanitizeEmailSubscriptions(values: readonly string[]) {
  if (values.includes("never")) {
    return [];
  }

  if (values.includes("daily")) {
    return ["daily"] satisfies StoredEmailSubscription[];
  }

  if (values.includes("weekly")) {
    return ["weekly"] satisfies StoredEmailSubscription[];
  }

  return [];
}

export function getInitialEmailSubscriptions(values: readonly string[]) {
  return sanitizeEmailSubscriptions(values);
}

export function getSelectedEmailOption(values: readonly string[]): EmailSubscription {
  const selected = sanitizeEmailSubscriptions(values);
  return selected[0] ?? "never";
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
