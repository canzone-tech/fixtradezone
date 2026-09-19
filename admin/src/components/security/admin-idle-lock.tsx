"use client";

import { useEffect, useState } from "react";
import type { AdminUser } from "@/lib/auth";
import { resolveAdminSession } from "@/lib/admin-session-client";
import IdleLock from "./idle-lock";

interface SessionPolicy {
  idleLockMinutes?: number;
}

const DEFAULT_IDLE_LOCK_MINUTES = 5;

export default function AdminIdleLock() {
  const [idleLockMinutes, setIdleLockMinutes] = useState(
    DEFAULT_IDLE_LOCK_MINUTES,
  );
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let mounted = true;

    async function refreshIdentity() {
      const session = await resolveAdminSession();
      if (mounted) {
        setUser(session.user);
      }
    }

    async function refreshPolicy() {
      try {
        const response = await fetch("/api/auth/session-policy", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const payload = (await response.json()) as SessionPolicy;

        if (
          mounted &&
          Number.isInteger(payload.idleLockMinutes) &&
          payload.idleLockMinutes !== undefined &&
          payload.idleLockMinutes >= 1 &&
          payload.idleLockMinutes <= 120
        ) {
          setIdleLockMinutes(payload.idleLockMinutes);
        }
      } catch {
        // Secure default remains active.
      }
    }

    void refreshIdentity();
    void refreshPolicy();

    const interval = window.setInterval(() => {
      void refreshPolicy();
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!user) return null;

  return (
    <IdleLock
      idleLockMinutes={idleLockMinutes}
      scopeKey={`admin:${user.id}`}
      identityLabel={user.email}
    />
  );
}
