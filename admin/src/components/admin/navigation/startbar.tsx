"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminUser } from "@/lib/auth";
import { resolveAdminSession } from "@/lib/admin-session-client";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  enabled?: boolean;
};

const sections: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: "MAIN MENU",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "iconoir-home-simple",
        permission: "dashboard.read",
        enabled: true,
      },
      {
        href: "/users",
        label: "Users",
        icon: "iconoir-user",
        permission: "users.read",
        enabled: true,
      },
      {
        href: "/rbac",
        label: "Roles & Permissions",
        icon: "iconoir-lock",
        permission: "rbac.read",
        enabled: true,
      },
    ],
  },
  {
    label: "TRADING & FINANCE",
    items: [
      {
        href: "/packages",
        label: "Packages",
        icon: "iconoir-box",
        permission: "packages.read",
        enabled: true,
      },
      {
        href: "/deposits",
        label: "Deposits",
        icon: "iconoir-wallet",
        permission: "deposits.read",
        enabled: true,
      },
      {
        href: "/wallets",
        label: "Wallets & Ledger",
        icon: "iconoir-bank",
        permission: "wallets.read",
        enabled: true,
      },
      {
        href: "/subscriptions",
        label: "Subscriptions",
        icon: "iconoir-box-iso",
        permission: "subscriptions.read",
        enabled: true,
      },
      {
        href: "/commissions",
        label: "Referral Commissions",
        icon: "iconoir-coins",
        permission: "commissions.read",
        enabled: true,
      },
      {
        href: "/rewards",
        label: "Rewards & Caps",
        icon: "iconoir-trophy",
        permission: "rewards.read",
        enabled: true,
      },
      {
        href: "/payouts",
        label: "Payouts",
        icon: "iconoir-coins-swap",
        permission: "payouts.read",
        enabled: true,
      },
      {
        href: "/referrals",
        label: "Referrals",
        icon: "iconoir-community",
        permission: "referrals.sponsor.manage",
        enabled: true,
      },
      {
        href: "/internal-trading",
        label: "Internal Trading",
        icon: "iconoir-graph-up",
        permission: "internal_trading.read",
        enabled: true,
      },
      {
        href: "/trade-activity",
        label: "Trade Activity",
        icon: "iconoir-graph-up",
        permission: "simulated_activity.read",
        enabled: true,
      },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        icon: "iconoir-bell",
        permission: "notifications.read",
        enabled: true,
      },
      {
        href: "/reports",
        label: "Reports",
        icon: "iconoir-graph-up",
        permission: "reports.read",
        enabled: true,
      },
      {
        href: "/templates",
        label: "Templates / CMS",
        icon: "iconoir-page",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "iconoir-settings",
        enabled: true,
      },
      {
        href: "/audit-logs",
        label: "Audit Logs",
        icon: "iconoir-journal-page",
        permission: "audit_logs.read",
        enabled: true,
      },
    ],
  },
];

export default function Startbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const session = await resolveAdminSession();

      if (mounted && session.user) {
        setUser(session.user);
      }
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  const close = () => {
    document.body.classList.remove("ftz-nav-open");
  };

  return (
    <>
      <aside className="ftz-sidebar" aria-label="Admin navigation">
        <Link href="/dashboard" className="ftz-logo" onClick={close}>
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone Admin Portal"
            width={200}
            height={53}
            priority
          />
        </Link>

        <nav className="ftz-sidebar-nav">
          {sections.map((section) => {
            const visibleItems = user
              ? section.items.filter((item) => {
                  if (isSuperAdmin) return true;
                  if (!item.enabled || !item.permission) return false;
                  return user.permissions.includes(item.permission);
                })
              : [];

            if (visibleItems.length === 0) return null;

            return (
              <div className="ftz-nav-section" key={section.label}>
                <div className="ftz-nav-label">{section.label}</div>
                {visibleItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  if (!item.enabled) {
                    return (
                      <span
                        className="ftz-nav-link is-disabled"
                        aria-disabled="true"
                        key={item.href}
                      >
                        <i className={item.icon} />
                        <span>{item.label}</span>
                      </span>
                    );
                  }

                  return (
                    <Link
                      href={item.href}
                      className={`ftz-nav-link ${active ? "is-active" : ""}`}
                      onClick={close}
                      key={item.href}
                    >
                      <i className={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="ftz-sidebar-profile">
          <div className="ftz-profile-shield">
            <i className="iconoir-shield-check" />
          </div>
          <div>
            <strong>{isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}</strong>
            <small>{isSuperAdmin ? "All Access" : "RBAC Access"}</small>
          </div>
          {isSuperAdmin ? (
            <Link
              href="/settings/security"
              className="ftz-sidebar-security-link"
              aria-label="Security configuration"
              title="Security configuration"
              onClick={close}
            >
              <i className="iconoir-settings" />
            </Link>
          ) : null}
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
