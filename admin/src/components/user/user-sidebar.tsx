"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FixTradeZoneBrand from "@/components/brand/fixtradezone-brand";
import {
  isImpersonationSession,
  type UserPortalSession,
} from "@/lib/user-session";
import styles from "./user-shell.module.css";

interface UserSidebarProps {
  session: UserPortalSession | null;
}

export default function UserSidebar({ session }: UserSidebarProps) {
  const pathname = usePathname();

  const close = () => {
    document.body.classList.remove("ftz-nav-open");
  };

  const impersonated =
    session !== null
      ? isImpersonationSession(session)
      : pathname.startsWith("/user/impersonation");

  const user = session?.user;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "USER"
    : "USER";

  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isActive = (href: string) => pathname === href;

  return (
    <>
      <aside className="ftz-sidebar" aria-label="User navigation">
        <Link
          href={impersonated ? "/user/impersonation" : "/user/dashboard"}
          className="ftz-logo"
          onClick={close}
        >
          <FixTradeZoneBrand
            portalLabel="USER PORTAL"
            className="ftz-brand-logo"
          />
        </Link>

        <nav className="ftz-sidebar-nav">
          <div className="ftz-nav-section">
            <div className="ftz-nav-label">MAIN MENU</div>

            {impersonated ? (
              <>
                <Link
                  href="/user/impersonation"
                  className={`ftz-nav-link ${
                    isActive("/user/impersonation") ? "is-active" : ""
                  }`}
                  onClick={close}
                >
                  <i className="iconoir-home-simple" />
                  <span>Overview</span>
                </Link>

                <Link
                  href="/user/impersonation#account-details"
                  className="ftz-nav-link"
                  onClick={close}
                >
                  <i className="iconoir-user" />
                  <span>Account Details</span>
                </Link>

                <Link
                  href="/user/impersonation#session-status"
                  className="ftz-nav-link"
                  onClick={close}
                >
                  <i className="iconoir-shield-check" />
                  <span>Session Status</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/user/dashboard"
                  className={`ftz-nav-link ${
                    isActive("/user/dashboard") ? "is-active" : ""
                  }`}
                  onClick={close}
                >
                  <i className="iconoir-home-simple" />
                  <span>Dashboard</span>
                </Link>

                <Link
                  href="/user/profile"
                  className={`ftz-nav-link ${
                    isActive("/user/profile") ? "is-active" : ""
                  }`}
                  onClick={close}
                >
                  <i className="iconoir-user" />
                  <span>My Profile</span>
                </Link>
              </>
            )}
          </div>

          <div className="ftz-nav-section">
            <div className="ftz-nav-label">TRADING & FINANCE</div>

            <Link
              href="/user/packages"
              className={`ftz-nav-link ${
                isActive("/user/packages") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-box" />
              <span>Packages</span>
            </Link>

            <Link
              href="/user/deposits"
              className={`ftz-nav-link ${
                isActive("/user/deposits") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-wallet" />
              <span>Deposits</span>
            </Link>

            <Link
              href="/user/wallet"
              className={`ftz-nav-link ${
                isActive("/user/wallet") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-bank" />
              <span>Wallet</span>
            </Link>

            <span
              className={`ftz-nav-link ${styles.disabledNav}`}
              aria-disabled="true"
            >
              <i className="iconoir-coins-swap" />
              <span>Payouts</span>
            </span>

            <Link
              href="/user/referrals"
              className={`ftz-nav-link ${
                isActive("/user/referrals") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-community" />
              <span>Referrals</span>
            </Link>

            <Link
              href="/user/trading"
              className={`ftz-nav-link ${
                isActive("/user/trading") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-graph-up" />
              <span>Trading</span>
            </Link>

            <Link
              href="/user/simulated-activity"
              className={`ftz-nav-link ${
                isActive("/user/simulated-activity") ? "is-active" : ""
              }`}
              onClick={close}
            >
              <i className="iconoir-graph-up" />
              <span>Simulated Trade Activity</span>
            </Link>
          </div>
        </nav>

        <div className="ftz-sidebar-profile">
          <div className={styles.userAvatar}>{user ? initials : "U"}</div>

          <div className={styles.profileCopy}>
            <strong>{displayName}</strong>

            <small>
              {session && isImpersonationSession(session)
                ? `${session.impersonation.accessMode} USER ACCESS`
                : "AUTHENTICATED USER"}
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
