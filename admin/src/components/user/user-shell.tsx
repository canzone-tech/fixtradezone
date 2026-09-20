"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import PlatformPromise from "@/components/brand/platform-promise";
import SiteModeBanner from "@/components/platform/site-mode-banner";
import IdleLock from "@/components/security/idle-lock";
import LiveMarketOverview from "@/components/ui/live-market-overview";
import { getOrCreateDeviceInstallationId } from "@/lib/device-installation";
import {
  isImpersonationSession,
  type UserPortalSession,
} from "@/lib/user-session";
import UserSetupGuide from "./user-setup-guide";
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
  const pathname = usePathname();

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
        // Duplicate-risk observation must never break the USER portal.
      });

    return () => {
      cancelled = true;
    };
  }, [deviceObservationUserId]);

  const lockScope = session
    ? impersonated
      ? `impersonation:${session.impersonation.id}:${session.user.id}`
      : `user:${session.user.id}`
    : null;
  const adminActivityMirrorScope =
    session && impersonated ? `admin:${session.impersonation.actor.id}` : null;
  const showPlatformPromise = pathname === "/user/dashboard";
  const showMarketOverview = showPlatformPromise && session !== null;

  return (
    <div className="ftz-admin-app">
      <UserSidebar session={session} />

      {session && lockScope ? (
        <IdleLock
          idleLockMinutes={session.sessionPolicy.idleLockMinutes}
          scopeKey={lockScope}
          activityMirrorScopeKey={adminActivityMirrorScope}
          identityLabel={session.user.email}
        />
      ) : null}

      <UserTopbar
        session={session}
        returning={returning}
        onReturnToAdmin={onReturnToAdmin}
      />

      <main className="ftz-main">
        <SiteModeBanner />

        {session && impersonated ? (
          <div className={styles.impersonationBar}>
            <span className={styles.bannerIcon}>
              <i className="iconoir-eye" />
            </span>

            <div className={styles.bannerCopy}>
              <strong>{`Viewing as ${session.user.email}`}</strong>
              <span>{`Administrator: ${session.impersonation.actor.email}`}</span>
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

        <div className={`ftz-page-frame ${styles.content}`}>
          {showPlatformPromise ? <PlatformPromise /> : null}
          {session && !impersonated ? (
            showPlatformPromise ? (
              <div
                className="ftz-dashboard"
                style={{
                  minHeight: 0,
                  paddingBottom: 0,
                  background: "transparent",
                }}
              >
                <div className="ftz-dashboard-layout">
                  <section style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                    <UserSetupGuide session={session} />
                  </section>
                </div>
              </div>
            ) : (
              <UserSetupGuide session={session} />
            )
          ) : null}
          {children}
          {showMarketOverview ? (
            <div
              className="ftz-dashboard"
              style={{ minHeight: 0, background: "transparent" }}
            >
              <div className="ftz-dashboard-layout">
                <section style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                  <LiveMarketOverview
                    overviewUrl="/api/user/market"
                    historyUrl="/api/user/market/history"
                  />
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
