"use client";

import { useEffect, useState } from "react";

interface Props {
  value: Date | string | null | undefined;
  className?: string;
  wrapParens?: boolean;
}

function formatRelative(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  if (absoluteSeconds < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 60) return formatter.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 24) return formatter.format(months, "month");
  return formatter.format(Math.round(days / 365), "year");
}

export default function RelativeTime({
  value,
  className,
  wrapParens = true,
}: Props) {
  const [label, setLabel] = useState<string | null>(null);

  const depKey = value instanceof Date ? value.getTime() : value ?? null;
  useEffect(() => {
    setLabel(formatRelative(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  if (!label) return null;
  return (
    <span className={className}>{wrapParens ? `(${label})` : label}</span>
  );
}
