"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isImpersonationSession,
  type UserPortalSession,
} from "@/lib/user-session";
import styles from "./user-shell.module.css";

interface UserTopbarProps {
  session: UserPortalSession | null;
  returning?: boolean;
  onReturnToAdmin?: () => void;
}

export default function UserTopbar({
  session,
  returning = false,
  onReturnToAdmin,
}: UserTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const toggleSidebar = () => {
    document.body.classList.toggle("ftz-nav-open");
  };

  const user = session?.user;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "User Account"
    : "User Account";

  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const impersonated = session !== null && isImpersonationSession(session);
  const idleMinutes = session?.sessionPolicy.idleLockMinutes;

  const heading = pathname.startsWith("/user/packages")
    ? {
        title: "Packages",
        subtitle: "Published USDT plans and exact commercial terms",
      }
    : pathname.startsWith("/user/deposits")
      ? {
          title: "Deposits",
          subtitle: "Package funding requests and payment history",
        }
      : pathname.startsWith("/user/wallet")
        ? {
            title: "My Wallet",
            subtitle: "Ledger-backed balances and immutable activity",
          }
        : pathname.startsWith("/user/referrals")
          ? {
              title: "My Referrals",
              subtitle: "Referral identity and direct network",
            }
          : pathname.startsWith("/user/trading")
            ? {
                title: "Trading",
                subtitle:
                  "Package trading progress, earnings and trade history",
              }
            : pathname.startsWith("/user/simulated-activity")
              ? {
                  title: "Simulated Trade Activity",
                  subtitle: "SIMULATED RESULTS",
                }
              : pathname === "/user/profile"
                ? {
                    title: "My Profile",
                    subtitle: "Account identity, security and session",
                  }
                : {
                    title: "User Dashboard",
                    subtitle: "Overview of your FixTradeZone account",
                  };

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        setLoggingOut(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

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
          <h1>{heading.title}</h1>
          <p>{heading.subtitle}</p>
        </div>
      </div>

      <div className="ftz-topbar-actions">
        {session ? (
          <>
            <span
              className={
                impersonated && session.impersonation.accessMode === "FULL"
                  ? styles.fullMode
                  : styles.limitedMode
              }
            >
              <i
                className={
                  impersonated && session.impersonation.accessMode === "FULL"
                    ? "iconoir-warning-triangle"
                    : "iconoir-shield-check"
                }
              />

              {impersonated ? session.impersonation.accessMode : "SECURE"}
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

            {impersonated && onReturnToAdmin ? (
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
            ) : (
              <button
                type="button"
                className="ftz-signout-button"
                disabled={loggingOut}
                onClick={() => void logout()}
                title="Sign out"
              >
                <i className="iconoir-log-out" />
                <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
              </button>
            )}
          </>
        ) : (
          <span className={styles.policyBadge}>
            <i className="iconoir-shield-check" />
            Validating
          </span>
        )}
      </div>
    </header>
  );
}
