"use client";

import {
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
  isValidTimeZone,
} from "@/lib/platform-time";

const PLATFORM_TIMEZONE_CHANGED_EVENT =
  "fixtradezone:platform-timezone-changed";

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

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/time", {
        cache: "no-store",
      });
      if (!response.ok) return;

      const payload = (await response.json().catch(() => ({}))) as {
        platformTimezone?: unknown;
      };
      if (
        typeof payload.platformTimezone === "string" &&
        isValidTimeZone(payload.platformTimezone)
      ) {
        setTimeZone(payload.platformTimezone);
        setLoaded(true);
      }
    } catch {
      // Keep the locked safe default. A temporary display-config failure must
      // never break authentication, deposits, or financial workflow screens.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

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
      {children}
    </PlatformTimeContext.Provider>
  );
}

export function usePlatformTime() {
  return useContext(PlatformTimeContext);
}
