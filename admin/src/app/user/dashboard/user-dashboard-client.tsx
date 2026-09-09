"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LiveActivityChart, {
  type LiveActivityPoint,
} from "@/components/ui/live-activity-chart";
import UserShell from "@/components/user/user-shell";
import type { DepositsResponse } from "@/lib/deposits";
import type { UserPayoutsResponse } from "@/lib/payouts";
import {
  formatPlatformDate,
  formatPlatformDateTime,
  platformIsoToLocalDateTimeInput,
} from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";
import type { UserWalletResponse, WalletActivity } from "@/lib/wallet";
import styles from "./user-dashboard.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

interface ReferralProfile {
  assignmentStatus: "ROOT" | "ASSIGNED" | "UNASSIGNED";
  referralCode: string | null;
}

interface DirectReferralsResponse {
  pagination: {
    total: number;
  };
}

interface SubscriptionSummaryResponse {
  active?: Array<{ id: string }>;
  history?: Array<{ id: string }>;
}

interface OptionalResponse<T> {
  ok: boolean;
  status: number;
  payload: T | null;
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
    value: "LIVE",
    detail: "Packages workspace",
    tone: "purple",
  },
  {
    code: "W",
    label: "Wallet",
    value: "LIVE",
    detail: "Ledger-backed wallet",
    tone: "orange",
  },
  {
    code: "R",
    label: "Referral",
    value: "LIVE",
    detail: "Referral workspace",
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

const DAY_MS = 24 * 60 * 60 * 1000;

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function optionalRequest<T>(url: string): Promise<OptionalResponse<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.ok ? await readPayload<T>(response) : null,
    };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

function formatDate(value: string | null): string {
  return value ? formatPlatformDateTime(value) : "No login recorded";
}

function platformDateKey(value: string | Date): string {
  return platformIsoToLocalDateTimeInput(value).slice(0, 10);
}

function buildWalletTrend(activity: WalletActivity[]): LiveActivityPoint[] {
  const counts = new Map<string, number>();

  for (const item of activity) {
    const key = platformDateKey(item.postedAt);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const now = Date.now();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * DAY_MS);
    const key = platformDateKey(date);
    return {
      label: formatPlatformDate(date),
      value: counts.get(key) ?? 0,
    };
  });
}

export default function UserDashboardClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [referralProfile, setReferralProfile] =
    useState<ReferralProfile | null>(null);
  const [directReferralTotal, setDirectReferralTotal] = useState<number | null>(
    null,
  );
  const [activePackageTotal, setActivePackageTotal] = useState<number | null>(
    null,
  );
  const [depositTotal, setDepositTotal] = useState<number | null>(null);
  const [payoutTotal, setPayoutTotal] = useState<number | null>(null);
  const [wallet, setWallet] = useState<UserWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        // Session validation/refresh runs first. Dashboard data requests start only
        // after it completes so a rotating refresh token cannot be consumed by
        // concurrent BFF requests when an access token has expired.
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
            payload?.redirectTo === "/dashboard" ? "/dashboard" : "/login",
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
          throw new Error(payload?.message || "Unable to load your dashboard.");
        }

        if (mounted) {
          setSession(payload);
        }

        const [
          profileResult,
          directResult,
          subscriptionsResult,
          depositsResult,
          payoutsResult,
          walletResult,
        ] = await Promise.all([
          optionalRequest<ReferralProfile>("/api/user/referrals"),
          optionalRequest<DirectReferralsResponse>(
            "/api/user/referrals/direct?page=1&limit=20",
          ),
          optionalRequest<SubscriptionSummaryResponse>(
            "/api/user/subscriptions?limit=100",
          ),
          optionalRequest<DepositsResponse>("/api/user/deposits?limit=100"),
          optionalRequest<UserPayoutsResponse>("/api/user/payouts?limit=100"),
          optionalRequest<UserWalletResponse>("/api/user/wallet?page=1&limit=100"),
        ]);

        if (
          [
            profileResult,
            directResult,
            subscriptionsResult,
            depositsResult,
            payoutsResult,
            walletResult,
          ].some((result) => result.status === 401)
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!mounted) return;

        if (profileResult.ok && profileResult.payload) {
          setReferralProfile(profileResult.payload);
        }

        if (
          directResult.ok &&
          typeof directResult.payload?.pagination?.total === "number"
        ) {
          setDirectReferralTotal(directResult.payload.pagination.total);
        }

        if (subscriptionsResult.ok && subscriptionsResult.payload) {
          setActivePackageTotal(subscriptionsResult.payload.active?.length ?? 0);
        }

        if (depositsResult.ok && depositsResult.payload) {
          setDepositTotal(
            typeof depositsResult.payload.total === "number"
              ? depositsResult.payload.total
              : depositsResult.payload.deposits.length,
          );
        }

        if (payoutsResult.ok && payoutsResult.payload) {
          setPayoutTotal(payoutsResult.payload.total);
        }

        if (walletResult.ok && walletResult.payload) {
          setWallet(walletResult.payload);
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

  const workspaceItems = useMemo(
    () =>
      workspaceStrip.map((item) => {
        if (item.label === "Referral") {
          return {
            ...item,
            value: referralProfile?.assignmentStatus ?? item.value,
            detail: referralProfile ? "Live referral API" : item.detail,
          };
        }

        if (item.label === "Package") {
          return {
            ...item,
            value: activePackageTotal ?? "—",
            detail: "Active subscriptions",
          };
        }

        if (item.label === "Wallet") {
          return {
            ...item,
            value: wallet?.totalActivity ?? "—",
            detail: "Immutable activity",
          };
        }

        return item;
      }),
    [activePackageTotal, referralProfile, wallet?.totalActivity],
  );

  const walletTrend = useMemo(
    () => buildWalletTrend(wallet?.activity ?? []),
    [wallet?.activity],
  );

  const recentWalletActivity = useMemo(
    () => wallet?.activity.slice(0, 5) ?? [],
    [wallet?.activity],
  );

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
          {workspaceItems.map((item) => (
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
                  Live account data from packages, wallet, deposits, payouts and
                  referrals in one ledger-aware workspace. Financial values remain
                  currency-specific and simulated activity stays clearly labelled.
                </p>

                <div className="ftz-hero-meta">
                  <span>
                    <i className="iconoir-user" />@{user.username}
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
                  <small>Active Packages</small>
                  <strong>{activePackageTotal ?? "—"}</strong>
                  <span>Live subscription lifecycle</span>
                </div>
              </article>

              <article className="ftz-metric-card is-blue">
                <div className="ftz-metric-icon">
                  <i className="iconoir-wallet" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Wallet Transactions</small>
                  <strong>{wallet?.totalActivity ?? "—"}</strong>
                  <span>Immutable ledger-backed activity</span>
                </div>
              </article>

              <article className="ftz-metric-card is-orange">
                <div className="ftz-metric-icon">
                  <i className="iconoir-bank" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Deposit Requests</small>
                  <strong>{depositTotal ?? "—"}</strong>
                  <span>Live deposit history</span>
                </div>
              </article>

              <article className="ftz-metric-card is-purple">
                <div className="ftz-metric-icon">
                  <i className="iconoir-coins-swap" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Payout Requests</small>
                  <strong>{payoutTotal ?? "—"}</strong>
                  <span>Live payout lifecycle</span>
                </div>
              </article>

              <article className="ftz-metric-card is-cyan">
                <div className="ftz-metric-icon">
                  <i className="iconoir-community" />
                </div>

                <div className="ftz-metric-copy">
                  <small>Direct Referrals</small>
                  <strong>{directReferralTotal ?? "—"}</strong>
                  <span>Live referral network</span>
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
                        Ledger-backed
                      </span>

                      <span>
                        <i className="dot purple" />
                        Platform timezone
                      </span>

                      <span>
                        <i className="dot blue" />
                        Live API data
                      </span>
                    </div>
                  </div>

                  <span className={styles.pendingBadge}>LIVE WALLET ACTIVITY</span>
                </div>

                <LiveActivityChart
                  title="Wallet activity"
                  description="Last 7 platform days · latest 100 ledger-backed entries"
                  points={walletTrend}
                  valueLabel="transactions"
                />

                <div className="ftz-chart-stats">
                  <div>
                    <small>Deposits</small>
                    <strong>{depositTotal ?? "—"}</strong>
                    <span>Request records</span>
                  </div>

                  <div>
                    <small>Payouts</small>
                    <strong>{payoutTotal ?? "—"}</strong>
                    <span className="purple">Request records</span>
                  </div>

                  <div>
                    <small>Wallet Assets</small>
                    <strong>{wallet?.wallets.length ?? "—"}</strong>
                    <span>Currency-specific balances</span>
                  </div>

                  <div>
                    <small>Simulated Results</small>
                    <strong>SIMULATED ONLY</strong>
                    <span className="orange">Never real trading</span>
                  </div>
                </div>
              </article>

              <div className="ftz-stack">
                <article className="ftz-panel ftz-deposit-panel">
                  <h3>Wallet Snapshot</h3>

                  <div className="ftz-users-package-grid">
                    <div>
                      <small>Tracked assets</small>
                      <strong>{wallet?.wallets.length ?? "—"}</strong>
                      <span>No cross-currency aggregation</span>
                    </div>

                    <div>
                      <small>Ledger activity</small>
                      <strong>{wallet?.totalActivity ?? "—"}</strong>
                      <span>Immutable transaction history</span>
                    </div>
                  </div>
                </article>

                <article className="ftz-panel ftz-users-package">
                  <h3>My Packages</h3>

                  <div className="ftz-users-package-grid">
                    <div>
                      <small>Active Packages</small>
                      <strong>{activePackageTotal ?? "—"}</strong>
                      <span>Live package subscriptions</span>
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
                      <strong>Immutable lifecycle records</strong>
                      <span>Published package terms remain authoritative</span>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <article className="ftz-panel ftz-transactions-panel">
              <div className="ftz-panel-heading">
                <h3>Recent Wallet Activity</h3>

                <button type="button" onClick={() => router.push("/user/wallet")}>
                  Open My Wallet
                </button>
              </div>

              <div className="ftz-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>TX ID</th>
                      <th>Type</th>
                      <th>Asset</th>
                      <th>Amount</th>
                      <th>Direction</th>
                      <th>Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentWalletActivity.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No readable wallet activity.</td>
                      </tr>
                    ) : (
                      recentWalletActivity.map((item) => (
                        <tr key={`${item.transactionId}-${item.bucket}`}>
                          <td>{item.transactionId}</td>
                          <td>{item.kind}</td>
                          <td>{item.currency}</td>
                          <td>{item.amount}</td>
                          <td>{item.direction}</td>
                          <td>{formatPlatformDateTime(item.postedAt)}</td>
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
              <h3>Referral Summary</h3>

              <div className="ftz-referral-top">
                <div className="ftz-referral-icon">
                  <i className="iconoir-community" />
                </div>

                <div>
                  <small>Direct Referrals</small>
                  <strong>{directReferralTotal ?? "—"}</strong>
                  <span>
                    {directReferralTotal === null
                      ? "Referral data unavailable"
                      : "Live referral API"}
                  </span>
                </div>
              </div>

              <div className="ftz-referral-split">
                <div>
                  <small>Referral Status</small>
                  <strong>{referralProfile?.assignmentStatus ?? "—"}</strong>
                  <span>
                    {referralProfile?.referralCode
                      ? `Code: ${referralProfile.referralCode}`
                      : "Open referral workspace"}
                  </span>
                </div>

                <div>
                  <small>Referral Earnings</small>
                  <strong>LIVE</strong>
                  <span>Commission history + wallet bucket</span>
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
                    <small>Role-aware portal authentication verified</small>
                  </div>

                  <time>NOW</time>
                </div>

                {recentWalletActivity[0] ? (
                  <div className="ftz-activity-row">
                    <span className="ftz-activity-icon is-blue">
                      <i className="iconoir-database" />
                    </span>

                    <div>
                      <strong>{recentWalletActivity[0].kind}</strong>
                      <small>
                        {recentWalletActivity[0].amount} {recentWalletActivity[0].currency}
                        {" · "}
                        {formatPlatformDateTime(recentWalletActivity[0].postedAt)}
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="ftz-activity-row">
                    <span className="ftz-activity-icon is-blue">
                      <i className="iconoir-clock" />
                    </span>

                    <div>
                      <strong>Last authenticated login</strong>
                      <small>{formatDate(user.lastLoginAt)}</small>
                    </div>
                  </div>
                )}
              </div>
            </article>

            <article className={styles.truthPanel}>
              <span className={styles.truthIcon}>
                <i className="iconoir-info-circle" />
              </span>

              <div>
                <strong>Data integrity first</strong>

                <p>
                  Exact financial values remain currency-specific and are never
                  aggregated across currencies here. Simulated activity will always
                  be explicitly labelled as simulated.
                </p>
              </div>
            </article>

            <article className="ftz-grow-card">
              <div>
                <h3>Manage Your Account</h3>

                <p>
                  Review your profile, account identity and secure session
                  information.
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
