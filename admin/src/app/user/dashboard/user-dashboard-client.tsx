"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./user-dashboard.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

const workspaceStrip = [
  {
    code: "A",
    label: "Account",
    value: "ACTIVE",
    detail: "Verified session",
    tone: "blue",
  },
  {
    code: "S",
    label: "Security",
    value: "SECURE",
    detail: "HttpOnly session",
    tone: "dark",
  },
  {
    code: "P",
    label: "Package",
    value: "AWAITING API",
    detail: "Module pending",
    tone: "purple",
  },
  {
    code: "W",
    label: "Wallet",
    value: "AWAITING API",
    detail: "Module pending",
    tone: "orange",
  },
  {
    code: "R",
    label: "Referral",
    value: "AWAITING API",
    detail: "Module pending",
    tone: "gold",
  },
  {
    code: "T",
    label: "Activity",
    value: "SIMULATED ONLY",
    detail: "Never real trading",
    tone: "blue",
  },
] as const;

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No login recorded";
  }

  return new Date(value).toLocaleString();
}

export default function UserDashboardClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await readPayload<UserDirectSession & ErrorPayload>(
          response,
        );

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (response.status === 403) {
          router.replace(
            payload?.redirectTo === "/dashboard"
              ? "/dashboard"
              : "/login",
          );
          router.refresh();
          return;
        }

        if (
          !response.ok ||
          !payload?.user ||
          !payload.sessionPolicy ||
          typeof payload.sessionPolicy.idleLockMinutes !== "number"
        ) {
          throw new Error(
            payload?.message || "Unable to load your dashboard.",
          );
        }

        if (mounted) {
          setSession(payload);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your dashboard.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    const user = session?.user;

    if (!user) {
      return "FixTradeZone User";
    }

    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "FixTradeZone User"
    );
  }, [session]);

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading secure USER workspace…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.errorState}>
          <i className="iconoir-warning-triangle" />
          <strong>Unable to load USER dashboard</strong>
          <p>{error || "Your authenticated session is unavailable."}</p>
        </div>
      </UserShell>
    );
  }

  const user = session.user;

  return (
    <UserShell session={session}>
      <div className="ftz-dashboard">
        <div
          className="ftz-market-ticker"
          aria-label="FixTradeZone USER workspace status"
        >
          {workspaceStrip.map((item) => (
            <div className="ftz-market-item" key={item.label}>
              <span className={`ftz-coin ftz-coin-${item.tone}`}>
                {item.code}
              </span>

              <div>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>

              <b className={styles.stripValue}>{item.value}</b>
            </div>
          ))}
        </div>

        <div className="ftz-dashboard-layout">
          <section className="ftz-dashboard-primary">
            <section className="ftz-hero">
              <div className="ftz-hero-copy">
                <span className="ftz-secure-pill">
                  <i className="iconoir-shield-check" />
                  Secure USER Workspace
                </span>

                <h2>Welcome back, {displayName}! 👋</h2>

                <p>
                  Manage your FixTradeZone account, packages, wallet,
                  referrals and clearly labelled simulated activity from
                  one secure workspace.
                </p>

                <div className="ftz-hero-meta">
                  <span>
                    <i className="iconoir-user" />
                    @{user.username}
                  </span>

                  <span>
                    <i className="iconoir-clock" />
                    Last login: {formatDate(user.lastLoginAt)}
                  </span>
                </div>
              </div>

              <div className="ftz-hero-art" aria-hidden="true" />
            </section>

            <section className="ftz-metric-grid">
              <article className="ftz-metric-card is-cyan">
                <div className="ftz-metric-icon">
                  <i className="iconoir-crown" />
                </div>

                <div className="ftz-metric-copy">
                  <small>My Package</small>
                  <strong>—</strong>
                  <span>Awaiting live Packages API</span>
                </div>
              </article>

              <article className="ftz-metric-card is-blue">
                <div className="ftz-metric-icon">
                  <i className="iconoir-wallet" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Wallet Balance</small>
                  <strong>—</strong>
                  <span>Awaiting live Wallet API</span>
                </div>
              </article>

              <article className="ftz-metric-card is-orange">
                <div className="ftz-metric-icon">
                  <i className="iconoir-bank" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Total Deposits</small>
                  <strong>—</strong>
                  <span>Awaiting live Deposit API</span>
                </div>
              </article>

              <article className="ftz-metric-card is-purple">
                <div className="ftz-metric-icon">
                  <i className="iconoir-coins-swap" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Total Payouts</small>
                  <strong>—</strong>
                  <span>Awaiting live Payout API</span>
                </div>
              </article>

              <article className="ftz-metric-card is-cyan">
                <div className="ftz-metric-icon">
                  <i className="iconoir-graph-up" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Simulated Trade Activity</small>
                  <strong>—</strong>
                  <span>SIMULATED RESULTS only</span>
                </div>
              </article>
            </section>

            <section className="ftz-mid-grid">
              <article className="ftz-panel ftz-trading-panel">
                <div className="ftz-panel-heading">
                  <div>
                    <h3>Account Activity Overview</h3>

                    <div className="ftz-legend">
                      <span>
                        <i className="dot green" />
                        Deposits
                      </span>

                      <span>
                        <i className="dot purple" />
                        Payouts
                      </span>

                      <span>
                        <i className="dot blue" />
                        Simulated Activity
                      </span>
                    </div>
                  </div>

                  <span className={styles.pendingBadge}>
                    LIVE API PENDING
                  </span>
                </div>

                <div className={styles.chartEmpty}>
                  <span className={styles.emptyIcon}>
                    <i className="iconoir-stats-up-square" />
                  </span>

                  <strong>Activity chart is ready for live data</strong>

                  <p>
                    Financial totals and chart points will appear only
                    after their production APIs are connected.
                  </p>
                </div>

                <div className="ftz-chart-stats">
                  <div>
                    <small>Total Deposits</small>
                    <strong>—</strong>
                    <span>Awaiting API</span>
                  </div>

                  <div>
                    <small>Total Payouts</small>
                    <strong>—</strong>
                    <span className="purple">Awaiting API</span>
                  </div>

                  <div>
                    <small>Referral Earnings</small>
                    <strong>—</strong>
                    <span>Awaiting API</span>
                  </div>

                  <div>
                    <small>Simulated Results</small>
                    <strong>—</strong>
                    <span className="orange">SIMULATED ONLY</span>
                  </div>
                </div>
              </article>

              <div className="ftz-stack">
                <article className="ftz-panel ftz-deposit-panel">
                  <h3>Deposits & Wallet</h3>

                  <div className={styles.compactEmpty}>
                    <span>
                      <i className="iconoir-wallet" />
                    </span>

                    <div>
                      <strong>Wallet module pending</strong>
                      <p>
                        Deposit account, transaction and balance data
                        will connect here through the Wallet module.
                      </p>
                    </div>
                  </div>
                </article>

                <article className="ftz-panel ftz-users-package">
                  <h3>My Package</h3>

                  <div className="ftz-users-package-grid">
                    <div>
                      <small>Current Package</small>
                      <strong>—</strong>
                      <span>Awaiting Packages API</span>
                    </div>

                    <div>
                      <small>Account Status</small>
                      <strong>{user.status}</strong>
                      <span>Authenticated USER</span>
                    </div>
                  </div>

                  <div className="ftz-popular-package">
                    <i className="iconoir-crown" />

                    <div>
                      <small>Package Workspace</small>
                      <strong>Production module pending</strong>
                      <span>No package value is being fabricated</span>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <article className="ftz-panel ftz-transactions-panel">
              <div className="ftz-panel-heading">
                <h3>Recent Transactions</h3>

                <span className={styles.pendingBadge}>
                  LIVE DATA PENDING
                </span>
              </div>

              <div className="ftz-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>TX ID</th>
                      <th>Type</th>
                      <th>Asset</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td colSpan={6}>
                        <div className={styles.tableEmpty}>
                          <i className="iconoir-database" />

                          <div>
                            <strong>No transaction API connected yet</strong>
                            <span>
                              Real user transactions will appear here.
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <aside className="ftz-dashboard-side">
            <article className="ftz-panel ftz-referral-card">
              <h3>Referral Summary</h3>

              <div className="ftz-referral-top">
                <div className="ftz-referral-icon">
                  <i className="iconoir-community" />
                </div>

                <div>
                  <small>Total Referrals</small>
                  <strong>—</strong>
                  <span>Awaiting Referral API</span>
                </div>
              </div>

              <div className="ftz-referral-split">
                <div>
                  <small>Active Referrals</small>
                  <strong>—</strong>
                  <span>Live data pending</span>
                </div>

                <div>
                  <small>Referral Earnings</small>
                  <strong>—</strong>
                  <span>Live data pending</span>
                </div>
              </div>
            </article>

            <article className="ftz-panel ftz-activity-panel">
              <div className="ftz-panel-heading">
                <h3>Recent Activity</h3>
              </div>

              <div className="ftz-activity-list">
                <div className="ftz-activity-row">
                  <span className="ftz-activity-icon is-green">
                    <i className="iconoir-shield-check" />
                  </span>

                  <div>
                    <strong>Secure USER session active</strong>
                    <small>
                      Role-aware portal authentication verified
                    </small>
                  </div>

                  <time>NOW</time>
                </div>

                <div className="ftz-activity-row">
                  <span className="ftz-activity-icon is-blue">
                    <i className="iconoir-clock" />
                  </span>

                  <div>
                    <strong>Last authenticated login</strong>
                    <small>{formatDate(user.lastLoginAt)}</small>
                  </div>
                </div>
              </div>
            </article>

            <article className={styles.truthPanel}>
              <span className={styles.truthIcon}>
                <i className="iconoir-info-circle" />
              </span>

              <div>
                <strong>Data integrity first</strong>

                <p>
                  Financial values remain unavailable until live APIs
                  exist. Simulated activity will always be explicitly
                  labelled as simulated.
                </p>
              </div>
            </article>

            <article className="ftz-grow-card">
              <div>
                <h3>Manage Your Account</h3>

                <p>
                  Review your profile, account identity and secure
                  session information.
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/user/profile")}
                >
                  Open My Profile
                  <i className="iconoir-arrow-right" />
                </button>
              </div>

              <div className="ftz-grow-art">
                <i className="iconoir-user" />
              </div>
            </article>
          </aside>
        </div>
      </div>
    </UserShell>
  );
}
