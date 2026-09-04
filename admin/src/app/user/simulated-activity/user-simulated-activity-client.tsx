"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "../../simulated-trades/simulated-trades.module.css";

interface ApiMessagePayload {
  message?: string | string[];
  redirectTo?: string | null;
}

interface EffectivePolicy {
  id: string;
  versionNumber: number;
  status: "PUBLISHED";
  enabled: boolean;
  activitiesPerDay: number;
  minimumGapMinutes: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: Array<{ start: string; end: string }>;
  timezoneSnapshot: string | null;
  effectiveFrom: string | null;
  disclosure: string;
  financialEffect: "NONE";
}

interface TradeActivityEvent {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  policyVersionId: string;
  packageCode: string;
  packageDisplayName: string;
  localActivityDate: string;
  slotNumber: number;
  scheduledAt: string;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: "WIN" | "LOSS";
  resultPercent: string;
  generationSource: "WORKER" | "RECONCILIATION";
  generatedAt: string;
  disclosure: string;
  financialEffect: "NONE";
}

interface ActivityPayload extends ApiMessagePayload {
  disclosure: string;
  financialEffect: "NONE";
  activeEligibleSubscriptions: number;
  effectivePolicy: EffectivePolicy | null;
  events: TradeActivityEvent[];
  page: number;
  limit: number;
  total: number;
}

class UserActivityAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserActivityAccessError";
  }
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }
  const message = payload.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string") {
    return message[0];
  }
  return fallback;
}

async function checkedUserJson<T extends ApiMessagePayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readPayload<T>(response);
  if (response.status === 401 || response.status === 403) {
    throw new UserActivityAccessError(
      messageFrom(payload, fallback),
      response.status,
      payload?.redirectTo ?? null,
    );
  }
  if (!response.ok || !payload) {
    throw new Error(messageFrom(payload, fallback));
  }
  return payload;
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserActivityAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

async function fetchWorkspace(): Promise<{
  session: UserDirectSession;
  activity: ActivityPayload;
}> {
  const sessionResponse = await fetch("/api/user/session", {
    cache: "no-store",
  });
  const session = await checkedUserJson<UserDirectSession & ApiMessagePayload>(
    sessionResponse,
    "USER session is unavailable.",
  );
  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  // Internal API naming remains stable for backwards compatibility. The portal
  // presents the client-facing feature as Trade Activity.
  const activityResponse = await fetch(
    "/api/user/simulated-activity?page=1&limit=100",
    { cache: "no-store" },
  );
  const activity = await checkedUserJson<ActivityPayload>(
    activityResponse,
    "Could not load trade activity.",
  );
  return { session, activity };
}

export default function UserSimulatedActivityClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const workspace = await fetchWorkspace();
      setSession(workspace.session);
      setActivity(workspace.activity);
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not load trade activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const workspace = await fetchWorkspace();
        if (!mounted) return;
        setSession(workspace.session);
        setActivity(workspace.activity);
      } catch (caught) {
        if (!mounted) return;
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          router.refresh();
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load trade activity.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      mounted = false;
    };
  }, [router]);

  const loadedWins = useMemo(
    () =>
      activity?.events.filter((event) => event.outcome === "WIN").length ?? 0,
    [activity],
  );
  const loadedLosses = useMemo(
    () =>
      activity?.events.filter((event) => event.outcome === "LOSS").length ?? 0,
    [activity],
  );
  const policy = activity?.effectivePolicy ?? null;

  if (loading && !session) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading trade activity…</p>
        </div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>TRADE ACTIVITY / ACTIVE PACKAGES</p>
            <h2>Daily Trades</h2>
            <p>
              Each ACTIVE package subscription receives its own deterministic
              daily trade schedule. Trade activity is system-generated according
              to package rules and does not represent external market execution.
            </p>
          </div>
          <span className={styles.disclosurePill}>TRADE ACTIVITY</span>
        </section>

        {error ? (
          <div className={styles.alert} data-tone="error">
            {error}
          </div>
        ) : null}

        <section className={styles.stats}>
          <article className={styles.stat}>
            <small>Eligible ACTIVE packages</small>
            <strong>{activity?.activeEligibleSubscriptions ?? 0}</strong>
          </article>
          <article className={styles.stat}>
            <small>Trades / day / package</small>
            <strong>{policy?.enabled ? policy.activitiesPerDay : "—"}</strong>
          </article>
          <article className={styles.stat}>
            <small>Loaded WIN / LOSS</small>
            <strong>
              {loadedWins} / {loadedLosses}
            </strong>
          </article>
          <article className={styles.stat}>
            <small>External execution</small>
            <strong>NONE</strong>
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>CURRENT TRADE ACTIVITY POLICY</p>
              <h3>
                {policy
                  ? `Published V${policy.versionNumber}`
                  : "No effective policy"}
              </h3>
            </div>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {policy ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Generation</dt>
                <dd>{policy.enabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt>Minimum trade gap</dt>
                <dd>
                  {policy.minimumGapMinutes > 0
                    ? `${policy.minimumGapMinutes} minutes`
                    : "Legacy schedule"}
                </dd>
              </div>
              <div>
                <dt>Allowed assets</dt>
                <dd>{policy.assetSymbols.join(", ")}</dd>
              </div>
              <div>
                <dt>WIN / LOSS weight</dt>
                <dd>
                  {policy.winWeight} / {policy.lossWeight}
                </dd>
              </div>
              <div>
                <dt>WIN range</dt>
                <dd>
                  {policy.winMinimumPercent}% – {policy.winMaximumPercent}%
                </dd>
              </div>
              <div>
                <dt>LOSS magnitude range</dt>
                <dd>
                  {policy.lossMinimumPercent}% – {policy.lossMaximumPercent}%
                </dd>
              </div>
              <div>
                <dt>Schedule timezone</dt>
                <dd>{policy.timezoneSnapshot ?? "—"}</dd>
              </div>
              <div>
                <dt>Effective from</dt>
                <dd>
                  {formatPlatformDateTime(
                    policy.effectiveFrom,
                    policy.timezoneSnapshot ?? undefined,
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <div className={styles.empty}>
              No published Trade Activity policy is effective yet. No trade rows
              will be invented while policy is unavailable.
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>IMMUTABLE HISTORY</p>
              <h3>My daily trades</h3>
            </div>
            <span className={styles.badge} data-tone="muted">
              {activity?.total ?? 0} total
            </span>
          </div>

          {!activity || activity.events.length === 0 ? (
            <div className={styles.empty}>
              No due trade activity has been generated for your ACTIVE packages
              yet.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Trade time</th>
                    <th>Asset</th>
                    <th>Outcome</th>
                    <th>Result</th>
                    <th>Trade #</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.packageDisplayName}</strong>
                        <br />
                        <span className={styles.muted}>
                          {event.packageCode}
                        </span>
                      </td>
                      <td>
                        {formatPlatformDateTime(
                          event.scheduledAt,
                          event.timezoneSnapshot,
                        )}
                        <br />
                        <span className={styles.muted}>
                          {event.timezoneSnapshot}
                        </span>
                      </td>
                      <td className={styles.mono}>{event.assetSymbol}</td>
                      <td
                        className={
                          event.outcome === "WIN" ? styles.win : styles.loss
                        }
                      >
                        {event.outcome}
                      </td>
                      <td
                        className={
                          event.outcome === "WIN" ? styles.win : styles.loss
                        }
                      >
                        {Number(event.resultPercent) > 0 ? "+" : ""}
                        {event.resultPercent}%
                      </td>
                      <td>
                        {event.localActivityDate} / {event.slotNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.disclosure}>
          <i className="iconoir-warning-triangle" />
          <div>
            <strong>SYSTEM-GENERATED TRADE ACTIVITY</strong>
            <p>{activity?.disclosure ?? "Trade activity does not represent external market execution."}</p>
            <p>
              This workspace does not itself change Main Wallet, Package
              Earnings, Referral Commission, Rewards, package caps or accounting
              ledger balances, and it exposes no Buy, Sell or Close controls.
            </p>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
