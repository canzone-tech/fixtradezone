export const DEFAULT_PLATFORM_TIMEZONE = "Asia/Kolkata";

let runtimePlatformTimezone = DEFAULT_PLATFORM_TIMEZONE;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getRuntimePlatformTimezone(): string {
  return runtimePlatformTimezone;
}

export function setRuntimePlatformTimezone(timeZone: string): boolean {
  if (!isValidTimeZone(timeZone)) return false;
  runtimePlatformTimezone = timeZone;
  return true;
}

function resolveTimeZone(timeZone?: string): string {
  return timeZone && isValidTimeZone(timeZone)
    ? timeZone
    : runtimePlatformTimezone;
}

export function formatPlatformDateTime(
  value: string | Date | null | undefined,
  timeZone?: string,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolveTimeZone(timeZone),
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
  timeZone?: string,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: resolveTimeZone(timeZone),
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
