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

export function parseCongressDateTime(
  dateValue?: string | null,
  timeValue?: string | null,
  fallbackValue?: string | null
): Date {
  const withTime = parseDateTimeValue(dateValue ?? undefined, timeValue ?? undefined);
  if (withTime) {
    return withTime;
  }

  return parseCongressDate(dateValue ?? undefined, fallbackValue ?? undefined);
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

function parseDateTimeValue(dateValue?: string, timeValue?: string) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const dateOnly = dateValue.match(CONGRESS_DATE_PATTERN);
  const time = timeValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateOnly || !time) {
    return null;
  }

  const [, year, month, day] = dateOnly;
  const [, hour, minute, second = "0"] = time;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
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

export function formatBillDateTime(value: Date | string) {
  return formatBillDate(value, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatRelativeBillTime(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return formatter.format(seconds, "second");
  }

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) {
    return formatter.format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 60) {
    return formatter.format(days, "day");
  }

  const months = Math.round(days / 30);
  if (Math.abs(months) < 24) {
    return formatter.format(months, "month");
  }

  return formatter.format(Math.round(days / 365), "year");
}
