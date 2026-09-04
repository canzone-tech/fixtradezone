"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import {
  clearAdminSessionCache,
  resolveAdminSession,
} from "@/lib/admin-session-client";

const routeHeadings: Array<{
  path: string;
  title: string;
  subtitle: string;
}> = [
  {
    path: "/deposits",
    title: "Deposits",
    subtitle: "Payment rails, receiving accounts and deposit review",
  },
  {
    path: "/wallets",
    title: "Wallets & Ledger",
    subtitle: "Wallet buckets, immutable ledger and accounting reconciliation",
  },
  {
    path: "/subscriptions",
    title: "Subscriptions",
    subtitle: "Package activation queue and immutable lifecycle history",
  },
  {
    path: "/commissions",
    title: "Referral Commissions",
    subtitle: "Versioned matching rules and immutable commission accounting",
  },
  {
    path: "/rewards",
    title: "Rewards, Caps & Lifecycle",
    subtitle: "Daily package settlement, cap progress and lifecycle controls",
  },
  {
    path: "/internal-trading",
    title: "Internal Trading",
    subtitle:
      "Automatic package trading, financial settlement and recovery controls",
  },
  {
    path: "/trade-activity",
    title: "Trade Activity",
    subtitle: "System-generated daily trade activity for active package subscriptions",
  },
  {
    path: "/simulated-trades",
    title: "Trade Activity",
    subtitle: "System-generated daily trade activity for active package subscriptions",
  },
  {
    path: "/packages",
    title: "Package Plans",
    subtitle: "Versioned catalogue and publication controls",
  },
  {
    path: "/referrals",
    title: "Referral Management",
    subtitle: "Enrollment and audited sponsor controls",
  },
  {
    path: "/users",
    title: "Users",
    subtitle: "Accounts, roles and access status",
  },
  {
    path: "/rbac",
    title: "Roles & Permissions",
    subtitle: "Backend-authoritative access management",
  },
  {
    path: "/settings",
    title: "Settings",
    subtitle: "Platform and security configuration",
  },
];

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const session = await resolveAdminSession();
      if (!session.user) {
        router.replace("/login");
        return;
      }
      if (mounted) setUser(session.user);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    if (!user) return "Super Admin";
    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Super Admin"
    );
  }, [user]);

  const initials = useMemo(
    () =>
      displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [displayName],
  );

  const toggleSidebar = () => {
    document.body.classList.toggle("ftz-nav-open");
  };

  const heading = routeHeadings.find(
    (candidate) =>
      pathname === candidate.path || pathname.startsWith(`${candidate.path}/`),
  ) ?? {
    title: "Dashboard",
    subtitle: "Live operational overview of your platform",
  };

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearAdminSessionCache();
    router.replace("/login");
    router.refresh();
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
        <span className="ftz-secure-pill">
          <i className="iconoir-shield-check" /> Live operational data
        </span>

        <div className="ftz-topbar-profile">
          <div className="ftz-avatar">{initials}</div>
          <div className="ftz-topbar-profile-copy">
            <strong>{displayName}</strong>
            <small>{user?.roles.join(" · ") ?? "SUPER_ADMIN"}</small>
          </div>
        </div>

        <button
          type="button"
          className="ftz-signout-button"
          onClick={() => void logout()}
          disabled={loggingOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <i className="iconoir-log-out" />
          <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
        </button>
      </div>
    </header>
  );
}
