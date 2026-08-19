"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";

const modules = [
  {
    name: "Authentication",
    detail: "Secure login, session rotation and logout",
    status: "Ready",
    tone: "ready",
  },
  {
    name: "Users & RBAC",
    detail: "Administrator roles and user controls",
    status: "Next",
    tone: "next",
  },
  {
    name: "Packages",
    detail: "Plans, pricing and subscription rules",
    status: "Queued",
    tone: "queued",
  },
  {
    name: "Deposits",
    detail: "Manual TXID review and approval controls",
    status: "Queued",
    tone: "queued",
  },
] as const;

export default function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: AdminUser;
        };

        if (!response.ok || !payload.user) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (isMounted) {
          setUser(payload.user);
        }
      } catch {
        router.replace("/login");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    if (!user) return "Administrator";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return fullName || user.username || user.email;
  }, [user]);

  const initials = useMemo(
    () =>
      displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [displayName],
  );

  async function logout() {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (isLoading || !user) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <div className="loading-mark">FT</div>
        <p>Securing your workspace…</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand brand-on-dark sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            FT
          </span>
          <span>
            <strong>FixTradeZone</strong>
            <small>Admin Console</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          <span className="nav-label">WORKSPACE</span>
          <Link className="nav-item active" href="/dashboard">
            <span aria-hidden="true">⌂</span> Overview
          </Link>
          <button className="nav-item" type="button" disabled>
            <span aria-hidden="true">◎</span> Users <small>Next</small>
          </button>
          <button className="nav-item" type="button" disabled>
            <span aria-hidden="true">◇</span> Packages
          </button>
          <button className="nav-item" type="button" disabled>
            <span aria-hidden="true">⇄</span> Deposits
          </button>

          <span className="nav-label nav-label-spaced">SYSTEM</span>
          <button className="nav-item" type="button" disabled>
            <span aria-hidden="true">⚙</span> Settings
          </button>
          <button className="nav-item" type="button" disabled>
            <span aria-hidden="true">▤</span> Audit logs
          </button>
        </nav>

        <div className="sidebar-foot">
          <span className="environment-dot" />
          <span>
            <strong>Secure session</strong>
            <small>API connected</small>
          </span>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <div>
            <span className="mobile-kicker">FixTradeZone Admin</span>
            <strong>Operations Overview</strong>
          </div>
          <div className="admin-profile">
            <span className="profile-avatar">{initials}</span>
            <span className="profile-copy">
              <strong>{displayName}</strong>
              <small>{user.roles.join(" · ")}</small>
            </span>
            <button
              className="logout-button"
              type="button"
              onClick={logout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-card">
            <div>
              <span className="eyebrow eyebrow-light">FAST V1 FOUNDATION</span>
              <h1>Jai Mahakaal, {displayName.split(" ")[0]}.</h1>
              <p>
                Authentication is the first live operations slice. Each next
                module will land here only after its API and local verification
                are complete.
              </p>
            </div>
            <div className="welcome-badge">
              <span>01</span>
              <small>Active slice</small>
            </div>
          </section>

          <section className="section-heading">
            <div>
              <span className="eyebrow">DELIVERY STATUS</span>
              <h2>Module rollout</h2>
            </div>
            <span className="live-chip">
              <i /> Live workspace
            </span>
          </section>

          <section className="module-grid" aria-label="Module rollout status">
            {modules.map((module, index) => (
              <article className="module-card" key={module.name}>
                <div className={`module-icon ${module.tone}`}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <span className={`status-chip ${module.tone}`}>
                  {module.status}
                </span>
                <h3>{module.name}</h3>
                <p>{module.detail}</p>
              </article>
            ))}
          </section>

          <section className="account-card">
            <div>
              <span className="eyebrow">CURRENT ACCOUNT</span>
              <h2>Verified administrator session</h2>
              <p>
                Identity is reloaded from MySQL on protected API requests. A
                blocked or suspended account loses access immediately.
              </p>
            </div>
            <dl className="account-details">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="active-status">{user.status}</span>
                </dd>
              </div>
              <div>
                <dt>Roles</dt>
                <dd>{user.roles.join(", ")}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>
    </main>
  );
}
