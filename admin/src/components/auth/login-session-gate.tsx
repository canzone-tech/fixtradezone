"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceInstallationId } from "@/lib/device-installation";
import { markAuthenticatedDeviceExperience } from "@/lib/entry-experience";

interface SessionProbe {
  user?: {
    id?: string;
  };
  redirectTo?: string;
}

export default function LoginSessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const deviceInstallationId = await getOrCreateDeviceInstallationId();
        await fetch("/api/auth/device-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceInstallationId }),
          cache: "no-store",
          credentials: "same-origin",
        });

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
      } catch {
        // Login remains available when session probing is unavailable.
      }

      if (!cancelled) setChecking(false);
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
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
