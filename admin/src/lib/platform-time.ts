export const DEFAULT_PLATFORM_TIMEZONE = "Asia/Kolkata";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatPlatformDateTime(
  value: string | Date | null | undefined,
  timeZone = DEFAULT_PLATFORM_TIMEZONE,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const resolvedTimeZone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_PLATFORM_TIMEZONE;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolvedTimeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

export function formatPlatformDate(
  value: string | Date | null | undefined,
  timeZone = DEFAULT_PLATFORM_TIMEZONE,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const resolvedTimeZone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_PLATFORM_TIMEZONE;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolvedTimeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
