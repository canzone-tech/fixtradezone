"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import PlatformPromise from "@/components/brand/platform-promise";
import SiteModeBanner from "@/components/platform/site-mode-banner";
import AdminIdleLock from "@/components/security/admin-idle-lock";
import { getOrCreateDeviceInstallationId } from "@/lib/device-installation";
import Startbar from "./navigation/startbar";
import Topbar from "./topbar/topbar";

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 992) {
        document.body.classList.remove("ftz-nav-open");
      }
    };

    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getOrCreateDeviceInstallationId()
      .then(async (deviceInstallationId) => {
        if (cancelled) return;

        await fetch("/api/auth/device-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceInstallationId }),
          cache: "no-store",
          credentials: "same-origin",
        });
      })
      .catch(() => {
        // Device context bootstrap must never break the admin portal.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const showPlatformPromise = pathname === "/dashboard";

  return (
    <div className="ftz-admin-app">
      <Startbar />
      <Topbar />
      <AdminIdleLock />
      <main className="ftz-main">
        <SiteModeBanner />
        <div className="ftz-page-frame">
          {showPlatformPromise ? <PlatformPromise /> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
