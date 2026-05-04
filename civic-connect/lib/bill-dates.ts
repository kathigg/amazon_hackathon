const CONGRESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCongressDate(
  value?: string,
  fallbackValue?: string
): Date {
  const primary = parseDateValue(value);
  if (primary) {
    return primary;
  }

  const fallback = parseDateValue(fallbackValue);
  if (fallback) {
    return fallback;
  }

  return new Date("2000-01-01T12:00:00.000Z");
}

function parseDateValue(value?: string) {
  if (!value) {
    return null;
  }

  const dateOnly = value.match(CONGRESS_DATE_PATTERN);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)
    );
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

export function formatBillDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(value));
}

export function formatBillShortDate(value: Date | string) {
  return formatBillDate(value, {
    month: "short",
    day: "numeric",
  });
}
