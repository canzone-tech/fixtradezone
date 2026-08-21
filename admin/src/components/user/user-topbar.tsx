"use client";

import type { UserImpersonationSession } from "@/lib/user-session";
import styles from "./user-shell.module.css";

interface UserTopbarProps {
  session: UserImpersonationSession | null;
  returning: boolean;
  onReturnToAdmin: () => void;
}

export default function UserTopbar({
  session,
  returning,
  onReturnToAdmin,
}: UserTopbarProps) {
  const toggleSidebar = () => {
    document.body.classList.toggle("ftz-nav-open");
  };

  const user = session?.user;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email
    : "User Account";

  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const accessMode = session?.impersonation.accessMode ?? "LIMITED";

  const idleMinutes = session?.sessionPolicy.idleLockMinutes ?? 5;

  return (
    <header className="ftz-topbar">
      <div className="ftz-topbar-title">
        <button
          type="button"
          className="ftz-icon-button ftz-menu-toggle"
          aria-label="Toggle navigation"
          onClick={toggleSidebar}
        >
          <i className="iconoir-menu-scale" />
        </button>

        <div>
          <h1>User Account</h1>
          <p>Secure account overview and session</p>
        </div>
      </div>

      <div className="ftz-topbar-actions">
        <span
          className={
            accessMode === "FULL" ? styles.fullMode : styles.limitedMode
          }
        >
          <i
            className={
              accessMode === "FULL"
                ? "iconoir-warning-triangle"
                : "iconoir-shield-check"
            }
          />

          {accessMode}
        </span>

        <span className={styles.policyBadge}>
          <i className="iconoir-timer" />
          {idleMinutes} min
        </span>

        <div className="ftz-topbar-profile">
          <div className="ftz-avatar">{initials}</div>

          <div className="ftz-topbar-profile-copy">
            <strong>{displayName}</strong>
            <small>USER</small>
          </div>
        </div>

        <button
          type="button"
          className={styles.returnButton}
          disabled={returning}
          onClick={onReturnToAdmin}
          title="Return to Admin"
        >
          <i className="iconoir-log-out" />

          <span>{returning ? "Returning..." : "Return to Admin"}</span>
        </button>
      </div>
    </header>
  );
}
