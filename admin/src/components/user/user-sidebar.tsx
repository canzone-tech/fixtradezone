"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserImpersonationSession } from "@/lib/user-session";
import styles from "./user-shell.module.css";

interface UserSidebarProps {
  session: UserImpersonationSession | null;
}

export default function UserSidebar({ session }: UserSidebarProps) {
  const pathname = usePathname();

  const close = () => {
    document.body.classList.remove("ftz-nav-open");
  };

  const user = session?.user;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email
    : "USER";

  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <aside className="ftz-sidebar" aria-label="User navigation">
        <Link href="/user/impersonation" className="ftz-logo" onClick={close}>
          <div className={styles.brandMark}>FTZ</div>

          <div className={styles.brandCopy}>
            <strong>FIXTRADEZONE</strong>
            <small>USER PORTAL</small>
          </div>
        </Link>

        <nav className="ftz-sidebar-nav">
          <div className="ftz-nav-section">
            <div className="ftz-nav-label">USER MENU</div>

            <Link
              href="/user/impersonation"
              className={`ftz-nav-link ${
                pathname === "/user/impersonation" ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-home-simple" />
              <span>Overview</span>
            </Link>

            <a href="#account-details" className="ftz-nav-link" onClick={close}>
              <i className="iconoir-user" />
              <span>Account Details</span>
            </a>

            <a href="#session-status" className="ftz-nav-link" onClick={close}>
              <i className="iconoir-shield-check" />
              <span>Session Status</span>
            </a>
          </div>
        </nav>

        <div className="ftz-sidebar-profile">
          <div className={styles.userAvatar}>{user ? initials : "U"}</div>

          <div className={styles.profileCopy}>
            <strong>{displayName}</strong>

            <small>
              {session
                ? `${session.impersonation.accessMode} USER ACCESS`
                : "USER SESSION"}
            </small>
          </div>

          <div
            className={styles.profileStatus}
            title="Authenticated USER session"
          >
            <i className="iconoir-shield-check" />
          </div>
        </div>
      </aside>

      <button
        className="ftz-sidebar-overlay"
        type="button"
        aria-label="Close navigation"
        onClick={close}
      />
    </>
  );
}
