export const DEFAULT_PLATFORM_TIMEZONE = "Asia/Kolkata";

// Operational UI timestamps resolve through this runtime value so a SUPER_ADMIN
// timezone change propagates consistently without changing immutable settlement
// timezone snapshots or absolute database timestamps.
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

// Explicit overrides are reserved for controlled previews/tests; ordinary UI
// rendering follows the runtime platform timezone set by PlatformTimeProvider.
function resolveTimeZone(timeZone?: string): string {
  return timeZone && isValidTimeZone(timeZone)
    ? timeZone
    : runtimePlatformTimezone;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

export function platformLocalDateTimeToIso(
  value: string,
  timeZone?: string,
): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const zone = resolveTimeZone(timeZone);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  if (
    !Number.isFinite(wallClockUtc) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  // Resolve the timezone offset iteratively so DST-aware zones are handled
  // without leaking browser-local timezone semantics into operational filters.
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(candidate), zone);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const next = candidate - (representedUtc - wallClockUtc);
    if (next === candidate) break;
    candidate = next;
  }

  const resolved = new Date(candidate);
  const parts = zonedParts(resolved, zone);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute ||
    parts.second !== second
  ) {
    // Reject nonexistent/ambiguous wall-clock values rather than silently
    // shifting an operational report window.
    return null;
  }

  return resolved.toISOString();
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
