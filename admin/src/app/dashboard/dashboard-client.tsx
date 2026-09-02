"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";

interface UsersResponse {
  total?: number;
  pagination?: { total?: number };
}

interface SubscriptionsResponse {
  total?: number;
}

interface DepositsResponse {
  total?: number;
}

interface WalletsResponse {
  total?: number;
}

interface LedgerTransaction {
  id: string;
  kind: string;
  currency: string;
  description: string;
  postedAt: string;
}

interface LedgerResponse {
  total?: number;
  transactions?: LedgerTransaction[];
}

interface DashboardSnapshot {
  users: number | null;
  subscriptions: number | null;
  deposits: number | null;
  walletRows: number | null;
  ledgerTransactions: number | null;
  recentLedger: LedgerTransaction[];
}

const moduleStrip = [
  {
    code: "U",
    label: "Users",
    detail: "Account directory",
    status: "LIVE",
    tone: "cyan",
  },
  {
    code: "P",
    label: "Packages",
    detail: "Versioned catalogue",
    status: "LIVE",
    tone: "blue",
  },
  {
    code: "D",
    label: "Deposits",
    detail: "Payment review",
    status: "LIVE",
    tone: "orange",
  },
  {
    code: "W",
    label: "Wallets",
    detail: "Double-entry ledger",
    status: "LIVE",
    tone: "green",
  },
  {
    code: "C",
    label: "Commissions",
    detail: "Referral accounting",
    status: "LIVE",
    tone: "purple",
  },
  {
    code: "R",
    label: "Rewards",
    detail: "Caps & lifecycle",
    status: "LIVE",
    tone: "gold",
  },
] as const;

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readTotal<T extends { total?: number }>(
  url: string,
  selector?: (payload: T) => number | undefined,
): Promise<number | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await readJson<T>(response);
    if (!payload) return null;
    const value = selector ? selector(payload) : payload.total;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export default function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>({
    users: null,
    subscriptions: null,
    deposits: null,
    walletRows: null,
    ledgerTransactions: null,
    recentLedger: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionPayload = await readJson<{ user?: AdminUser }>(
          sessionResponse,
        );

        if (!sessionResponse.ok || !sessionPayload?.user) {
          router.replace("/login");
          return;
        }

        if (mounted) setUser(sessionPayload.user);

        const [users, subscriptions, deposits, walletRows, ledgerResponse] =
          await Promise.all([
            readTotal<UsersResponse>(
              "/api/admin/users?page=1&limit=1",
              (payload) => payload.pagination?.total,
            ),
            readTotal<SubscriptionsResponse>(
              "/api/admin/subscriptions?limit=1",
            ),
            readTotal<DepositsResponse>("/api/admin/deposits?limit=1"),
            readTotal<WalletsResponse>("/api/admin/wallets?limit=1"),
            fetch("/api/admin/ledger?limit=5", { cache: "no-store" })
              .then(async (response) =>
                response.ok ? await readJson<LedgerResponse>(response) : null,
              )
              .catch(() => null),
          ]);

        if (mounted) {
          setSnapshot({
            users,
            subscriptions,
            deposits,
            walletRows,
            ledgerTransactions:
              typeof ledgerResponse?.total === "number"
                ? ledgerResponse.total
                : null,
            recentLedger: Array.isArray(ledgerResponse?.transactions)
              ? ledgerResponse.transactions
              : [],
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    if (!user) return "Administrator";
    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Administrator"
    );
  }, [user]);

  const metrics = [
    {
      label: "Total Users",
      value: snapshot.users,
      detail: "Live user directory",
      icon: "iconoir-community",
      tone: "cyan",
    },
    {
      label: "Subscriptions",
      value: snapshot.subscriptions,
      detail: "Immutable package records",
      icon: "iconoir-box",
      tone: "blue",
    },
    {
      label: "Deposit Requests",
      value: snapshot.deposits,
      detail: "All deposit states",
      icon: "iconoir-wallet",
      tone: "orange",
    },
    {
      label: "Wallet Rows",
      value: snapshot.walletRows,
      detail: "Per-user currency buckets",
      icon: "iconoir-bank",
      tone: "purple",
    },
    {
      label: "Ledger Transactions",
      value: snapshot.ledgerTransactions,
      detail: "Immutable accounting entries",
      icon: "iconoir-book-stack",
      tone: "cyan",
    },
  ] as const;

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading secure workspace…</p>
      </div>
    );
  }

  return (
    <div className="ftz-dashboard">
      <div
        className="ftz-market-ticker"
        aria-label="FixTradeZone live module status"
      >
        {moduleStrip.map((item) => (
          <div className="ftz-market-item" key={item.label}>
            <span className={`ftz-coin ftz-coin-${item.tone}`}>
              {item.code}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
            <b>{item.status}</b>
          </div>
        ))}
      </div>

      <div className="ftz-dashboard-layout">
        <section className="ftz-dashboard-primary">
          <section className="ftz-hero">
            <div className="ftz-hero-copy">
              <span className="ftz-secure-pill">
                <i className="iconoir-shield-check" /> Secure Workspace
              </span>
              <h2>Welcome back, {displayName}! 👋</h2>
              <p>
                Monitor FixTradeZone from live operational modules. Financial
                values remain in their currency-specific ledger-backed screens.
              </p>
              <div className="ftz-hero-meta">
                <span>
                  <i className="iconoir-clock" /> Last login:{" "}
                  {formatPlatformDateTime(user?.lastLoginAt)}
                </span>
                <span>
                  <i className="iconoir-shield-check" /> Backend-authoritative
                  RBAC
                </span>
              </div>
            </div>
            <div className="ftz-hero-art" aria-hidden="true" />
          </section>

          <section className="ftz-metric-grid">
            {metrics.map((metric) => (
              <article
                className={`ftz-metric-card is-${metric.tone}`}
                key={metric.label}
              >
                <div className="ftz-metric-icon">
                  <i className={metric.icon} />
                </div>
                <div className="ftz-metric-copy">
                  <small>{metric.label}</small>
                  <strong>{metric.value ?? "—"}</strong>
                  <span>{metric.detail}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="ftz-mid-grid">
            <article className="ftz-panel ftz-trading-panel">
              <div className="ftz-panel-heading">
                <div>
                  <h3>Operational Overview</h3>
                  <div className="ftz-legend">
                    <span>
                      <i className="dot green" /> Live backend data
                    </span>
                    <span>
                      <i className="dot blue" /> Versioned policy
                    </span>
                    <span>
                      <i className="dot purple" /> Immutable accounting
                    </span>
                  </div>
                </div>
              </div>

              <div className="ftz-chart-stats">
                <div>
                  <small>Deposits</small>
                  <strong>LIVE</strong>
                  <span>Review + approval</span>
                </div>
                <div>
                  <small>Packages</small>
                  <strong>LIVE</strong>
                  <span className="purple">Versioned catalogue</span>
                </div>
                <div>
                  <small>Commissions</small>
                  <strong>LIVE</strong>
                  <span>Ledger-backed</span>
                </div>
                <div>
                  <small>Simulated Activity</small>
                  <strong>SIMULATED ONLY</strong>
                  <span className="orange">Never real trading</span>
                </div>
              </div>
            </article>

            <div className="ftz-stack">
              <article className="ftz-panel ftz-deposit-panel">
                <h3>Financial Integrity</h3>
                <div className="ftz-referral-split">
                  <div>
                    <small>Currency aggregation</small>
                    <strong>DISABLED</strong>
                    <span>No misleading cross-currency totals</span>
                  </div>
                  <div>
                    <small>Accounting</small>
                    <strong>DOUBLE ENTRY</strong>
                    <span>Inspect exact values in Wallets & Ledger</span>
                  </div>
                </div>
              </article>

              <article className="ftz-panel ftz-users-package">
                <h3>Release Status</h3>
                <div className="ftz-users-package-grid">
                  <div>
                    <small>Platform timezone</small>
                    <strong>CONFIGURABLE</strong>
                    <span>Operational timestamps follow Settings</span>
                  </div>
                  <div>
                    <small>Reward automation</small>
                    <strong>CONTROLLED</strong>
                    <span>Operations mode + infrastructure switch</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <article className="ftz-panel ftz-transactions-panel">
            <div className="ftz-panel-heading">
              <h3>Recent Ledger Activity</h3>
              <button type="button" onClick={() => router.push("/wallets")}>
                View ledger
              </button>
            </div>

            <div className="ftz-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Currency</th>
                    <th>Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recentLedger.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No readable ledger activity.</td>
                    </tr>
                  ) : (
                    snapshot.recentLedger.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.kind}</td>
                        <td>{entry.description}</td>
                        <td>{entry.currency}</td>
                        <td>{formatPlatformDateTime(entry.postedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="ftz-dashboard-side">
          <article className="ftz-panel ftz-referral-card">
            <h3>Live Control Surfaces</h3>
            <div className="ftz-referral-split">
              <div>
                <small>Rewards & Caps</small>
                <strong>LIVE</strong>
                <span>Due queue + lifecycle state</span>
              </div>
              <div>
                <small>Referral Commissions</small>
                <strong>LIVE</strong>
                <span>Versioned matching</span>
              </div>
            </div>
          </article>

          <article className="ftz-panel ftz-activity-panel">
            <div className="ftz-panel-heading">
              <h3>Release Guardrails</h3>
            </div>
            <div className="ftz-activity-list">
              <div className="ftz-activity-row">
                <span className="ftz-activity-icon is-green">
                  <i className="iconoir-shield-check" />
                </span>
                <div>
                  <strong>RBAC enforced</strong>
                  <small>Backend remains authorization source of truth</small>
                </div>
              </div>
              <div className="ftz-activity-row">
                <span className="ftz-activity-icon is-blue">
                  <i className="iconoir-database" />
                </span>
                <div>
                  <strong>Financial data stays exact</strong>
                  <small>
                    No demo balances or fabricated transaction totals
                  </small>
                </div>
              </div>
            </div>
          </article>

          <article className="ftz-grow-card">
            <div>
              <h3>Operations Control</h3>
              <p>
                Configure platform timezone and automatic or controlled-manual
                processing from the protected settings workspace.
              </p>
              <button
                type="button"
                onClick={() => router.push("/settings/operations")}
              >
                Open Operations
                <i className="iconoir-arrow-right" />
              </button>
            </div>
            <div className="ftz-grow-art">
              <i className="iconoir-settings" />
            </div>
          </article>
        </aside>
      </div>
    </div>
  );
}
