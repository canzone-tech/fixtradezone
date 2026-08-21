"use client";

import { type ReactNode, useEffect } from "react";
import type { UserImpersonationSession } from "@/lib/user-session";
import IdleLock from "@/components/security/idle-lock";
import UserSidebar from "./user-sidebar";
import UserTopbar from "./user-topbar";
import styles from "./user-shell.module.css";

interface UserShellProps {
  children: ReactNode;
  session: UserImpersonationSession | null;
  returning: boolean;
  onReturnToAdmin: () => void;
}

export default function UserShell({
  children,
  session,
  returning,
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

  return (
    <div className="ftz-admin-app">
      <UserSidebar session={session} />

      {session ? (
        <IdleLock
          idleLockMinutes={session.sessionPolicy.idleLockMinutes}
          scopeKey={`impersonation:${session.impersonation.actor.id}`}
        />
      ) : null}

      <UserTopbar
        session={session}
        returning={returning}
        onReturnToAdmin={onReturnToAdmin}
      />

      <main className="ftz-main">
        <div className={styles.impersonationBar}>
          <span className={styles.bannerIcon}>
            <i className="iconoir-eye" />
          </span>

          <div className={styles.bannerCopy}>
            <strong>
              {session
                ? `Viewing as ${session.user.email}`
                : "Loading user session"}
            </strong>

            <span>
              {session
                ? `Administrator: ${session.impersonation.actor.email}`
                : "Validating impersonation session..."}
            </span>
          </div>

          {session ? (
            <span
              className={
                session.impersonation.accessMode === "FULL"
                  ? styles.bannerFull
                  : styles.bannerLimited
              }
            >
              {session.impersonation.accessMode} ACCESS
            </span>
          ) : null}
        </div>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
