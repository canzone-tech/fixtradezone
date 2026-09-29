"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceInstallationId } from "@/lib/device-installation";
import {
  hasAuthenticatedDeviceExperience,
  hasInstalledAppExperience,
  isStandaloneApp,
  markAppInstalled,
  markAuthenticatedDeviceExperience,
} from "@/lib/entry-experience";

interface SessionProbe {
  user?: {
    id?: string;
  };
  redirectTo?: string;
}

async function bootstrapDeviceContext(): Promise<void> {
  const deviceInstallationId = await getOrCreateDeviceInstallationId();
  await fetch("/api/auth/device-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceInstallationId }),
    cache: "no-store",
    credentials: "same-origin",
  });
}

export default function SmartEntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveEntry() {
      if (isStandaloneApp()) {
        markAppInstalled();
      }

      const installed = hasInstalledAppExperience();
      const returning = hasAuthenticatedDeviceExperience();

      try {
        await bootstrapDeviceContext();

        if (cancelled) return;

        const response = await fetch("/api/user/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = (await response.json().catch(() => ({}))) as SessionProbe;

        if (cancelled) return;

        if (response.ok && payload.user?.id) {
          markAuthenticatedDeviceExperience();
          router.replace("/user/dashboard");
          return;
        }

        if (response.status === 403 && payload.redirectTo === "/dashboard") {
          markAuthenticatedDeviceExperience();
          router.replace("/dashboard");
          return;
        }

        if (installed && returning) {
          router.replace("/login");
          return;
        }
      } catch {
        if (cancelled) return;

        if (installed && returning) {
          router.replace("/login");
          return;
        }
      }

      if (!cancelled) {
        setShowLanding(true);
      }
    }

    void resolveEntry();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!showLanding) {
    return (
      <main
        aria-busy="true"
        aria-label="Checking FixTradeZone session"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#020b1b",
          color: "#8fa6c3",
          fontSize: 12,
          letterSpacing: ".04em",
        }}
      >
        Checking secure session…
      </main>
    );
  }

  return children;
}
