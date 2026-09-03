"use client";

import { type ReactNode, useEffect } from "react";
import IdleLock from "@/components/security/idle-lock";
import { getOrCreateDeviceInstallationId } from "@/lib/device-installation";
import {
  isImpersonationSession,
  type UserPortalSession,
} from "@/lib/user-session";
import UserSidebar from "./user-sidebar";
import UserTopbar from "./user-topbar";
import styles from "./user-shell.module.css";

interface UserShellProps {
  children: ReactNode;
  session: UserPortalSession | null;
  returning?: boolean;
  onReturnToAdmin?: () => void;
}

export default function UserShell({
  children,
  session,
  returning = false,
  onReturnToAdmin,
}: UserShellProps) {
  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 992) {
        document.body.classList.remove("ftz-nav-open");
      }
    };

    window.addEventListener("resize", closeOnDesktop);

    return () => {
      window.removeEventListener("resize", closeOnDesktop);
      document.body.classList.remove("ftz-nav-open");
    };
  }, []);

  const impersonated = session !== null && isImpersonationSession(session);
  const deviceObservationUserId =
    session && !impersonated ? session.user.id : null;

  useEffect(() => {
    if (!deviceObservationUserId) return;

    let cancelled = false;

    void getOrCreateDeviceInstallationId()
      .then(async (deviceInstallationId) => {
        if (cancelled) return;

        await fetch("/api/user/device-installation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceInstallationId }),
          cache: "no-store",
        });
      })
      .catch(() => {
        // Device observation is a duplicate-risk signal. It must never break the
        // authenticated USER portal when browser storage or the observer is down.
      });

    return () => {
      cancelled = true;
    };
  }, [deviceObservationUserId]);

  const lockScope = session
    ? impersonated
      ? `impersonation:${session.impersonation.actor.id}`
      : `user:${session.user.id}`
    : null;

  return (
    <div className="ftz-admin-app">
      <UserSidebar session={session} />

      {session && lockScope ? (
        <IdleLock
          idleLockMinutes={session.sessionPolicy.idleLockMinutes}
          scopeKey={lockScope}
        />
      ) : null}

      <UserTopbar
        session={session}
        returning={returning}
        onReturnToAdmin={onReturnToAdmin}
      />

      <main className="ftz-main">
        {session && impersonated ? (
          <div className={styles.impersonationBar}>
            <span className={styles.bannerIcon}>
              <i className="iconoir-eye" />
            </span>

            <div className={styles.bannerCopy}>
              <strong>{`Viewing as ${session.user.email}`}</strong>

              <span>
                {`Administrator: ${session.impersonation.actor.email}`}
              </span>
            </div>

            <span
              className={
                session.impersonation.accessMode === "FULL"
                  ? styles.bannerFull
                  : styles.bannerLimited
              }
            >
              {session.impersonation.accessMode} ACCESS
            </span>
          </div>
        ) : null}

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
