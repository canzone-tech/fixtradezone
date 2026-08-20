"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
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
        enabled: true,
      },
      {
        href: "/users",
        label: "Users",
        icon: "iconoir-user",
        enabled: true,
      },
      {
        href: "/rbac",
        label: "Roles & Permissions",
        icon: "iconoir-lock",
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
      },
      {
        href: "/deposits",
        label: "Deposits",
        icon: "iconoir-wallet",
      },
      {
        href: "/payouts",
        label: "Payouts",
        icon: "iconoir-coins-swap",
      },
      {
        href: "/referrals",
        label: "Referrals",
        icon: "iconoir-community",
      },
      {
        href: "/simulated-trades",
        label: "Simulated Trade Activity",
        icon: "iconoir-graph-up",
      },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      {
        href: "/templates",
        label: "Templates / CMS",
        icon: "iconoir-page",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "iconoir-settings",
      },
      {
        href: "/audit-logs",
        label: "Audit Logs",
        icon: "iconoir-journal-page",
      },
    ],
  },
];

export default function Startbar() {
  const pathname = usePathname();

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
          {sections.map((section) => (
            <div className="ftz-nav-section" key={section.label}>
              <div className="ftz-nav-label">{section.label}</div>

              {section.items.map((item) => {
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
          ))}
        </nav>

        <div className="ftz-sidebar-profile">
          <div className="ftz-profile-shield">
            <i className="iconoir-shield-check" />
          </div>
          <div>
            <strong>SUPER ADMIN</strong>
            <small>All Access</small>
          </div>
          <i className="iconoir-nav-arrow-down ms-auto" />
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
