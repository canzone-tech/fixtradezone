"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isPublicSiteModeStatus,
  SITE_MODE_CHANGED_EVENT,
  type PublicSiteModeStatus,
} from "@/lib/site-mode";
import styles from "./site-mode-banner.module.css";

export default function SiteModeBanner() {
  const [status, setStatus] = useState<PublicSiteModeStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/public/site-mode", {
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);

      setStatus(
        response.ok && isPublicSiteModeStatus(payload) ? payload : null,
      );
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();

    const refresh = () => void load();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener(SITE_MODE_CHANGED_EVENT, refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(SITE_MODE_CHANGED_EVENT, refresh);
    };
  }, [load]);

  if (!status || status.siteMode === "LIVE") return null;

  const maintenance = status.siteMode === "MAINTENANCE";

  return (
    <div
      className={`${styles.banner} ${maintenance ? styles.maintenance : ""}`}
      role="status"
      aria-live="polite"
    >
      <i className={maintenance ? "iconoir-tools" : "iconoir-flask"} />
      <span>
        <strong>{status.siteMode} MODE</strong>
        {" · "}
        {maintenance
          ? "Public access is paused. SUPER_ADMIN recovery access remains available."
          : "Automatic processing is paused. Access is limited to approved testers and SUPER_ADMIN."}
      </span>
    </div>
  );
}
