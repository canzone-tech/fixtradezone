"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_PLATFORM_TIMEZONE,
  formatPlatformDate,
  formatPlatformDateTime,
  setRuntimePlatformTimezone,
} from "@/lib/platform-time";

const PLATFORM_TIMEZONE_CHANGED_EVENT =
  "fixtradezone:platform-timezone-changed";

type PlatformDateValue = string | Date | null | undefined;

interface PlatformTimeContextValue {
  timeZone: string;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const PlatformTimeContext = createContext<PlatformTimeContextValue>({
  timeZone: DEFAULT_PLATFORM_TIMEZONE,
  loaded: false,
  refresh: async () => undefined,
});

async function fetchPlatformTimezone(): Promise<string | null> {
  try {
    const response = await fetch("/api/platform/time", {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => ({}))) as {
      platformTimezone?: unknown;
    };

    return payload.platformTimezone === DEFAULT_PLATFORM_TIMEZONE
      ? DEFAULT_PLATFORM_TIMEZONE
      : null;
  } catch {
    return null;
  }
}

export function notifyPlatformTimezoneChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PLATFORM_TIMEZONE_CHANGED_EVENT));
  }
}

export default function PlatformTimeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [timeZone, setTimeZone] = useState(DEFAULT_PLATFORM_TIMEZONE);
  const [loaded, setLoaded] = useState(false);

  const applyUtc = useCallback(() => {
    setRuntimePlatformTimezone(DEFAULT_PLATFORM_TIMEZONE);
    setTimeZone(DEFAULT_PLATFORM_TIMEZONE);
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    await fetchPlatformTimezone();
    applyUtc();
  }, [applyUtc]);

  useEffect(() => {
    let active = true;

    void fetchPlatformTimezone().then(() => {
      if (!active) return;
      applyUtc();
    });

    return () => {
      active = false;
    };
  }, [pathname, applyUtc]);

  useEffect(() => {
    const listener = () => void refresh();
    window.addEventListener(PLATFORM_TIMEZONE_CHANGED_EVENT, listener);
    return () =>
      window.removeEventListener(PLATFORM_TIMEZONE_CHANGED_EVENT, listener);
  }, [refresh]);

  const value = useMemo(
    () => ({ timeZone, loaded, refresh }),
    [timeZone, loaded, refresh],
  );

  return (
    <PlatformTimeContext.Provider value={value}>
      <Fragment key={timeZone}>{children}</Fragment>
    </PlatformTimeContext.Provider>
  );
}

export function usePlatformTime() {
  return useContext(PlatformTimeContext);
}

export function usePlatformDateTimeFormatter() {
  const { timeZone } = usePlatformTime();

  return useCallback(
    (value: PlatformDateValue) => formatPlatformDateTime(value, timeZone),
    [timeZone],
  );
}

export function usePlatformDateFormatter() {
  const { timeZone } = usePlatformTime();

  return useCallback(
    (value: PlatformDateValue) => formatPlatformDate(value, timeZone),
    [timeZone],
  );
}
