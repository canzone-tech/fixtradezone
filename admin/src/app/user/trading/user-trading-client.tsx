"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import HistoryControls, {
  INITIAL_HISTORY_QUERY,
  historyQueryParams,
  type HistoryQuery,
} from "@/components/user/history-controls";
import { formatPlatformDate } from "@/lib/platform-time";
import { isImpersonationSession, type UserPortalSession } from "@/lib/user-session";
import styles from "../../internal-trading/internal-trading.module.css";

interface ApiMessage {
  message?: string | string[];
  redirectTo?: string | null;
}

interface TradingPackage {
  subscriptionId: string;
  financialModelVersion: 'V1' | 'V2';
  packageCode: string;
  packageDisplayName: string;
  currency: string;
  principalAmount: string;
  grossMultiplier: string;
  grossTarget: string;
  userSharePercent: string;
  adminSharePercent: string;
  timezoneSnapshot: string;
  activationLocalDate: string;
  finalLocalDate: string;
  grossNetProgress: string;
  grossHighWaterMark: string;
  userCreditedAmount: string;
  adminRecognizedAmount: string;
  nextTradeLocalDate: string;
  settledTradeCount: number;
  status: "ACTIVE" | "COMPLETED" | "BLOCKED";
}

interface PackagesPayload extends ApiMessage {
  packages: TradingPackage[];
}

interface DailyClaim {
  id: string;
  subscriptionId: string;
  localTradeDate: string;
  currency: string;
  dailyGrossRatePercent: string;
  dailyNetGrossAmount: string;
  userSharePercent: string;
  userAmount: string;
  status: 'PENDING' | 'CLAIMED';
  tradeCount: number;
  claimedAt: string | null;
}

interface ClaimsPayload extends ApiMessage {
  pendingCount: number;
  pendingAmount: string;
  claims: DailyClaim[];
}

interface TradeEvent {
  id: string;
  localTradeDate: string;
  tradeDayNumber: number;
  slotNumber: number;
  scheduledAt: string;
  assetSymbol: string;
  outcome: "WIN" | "LOSS";
  eventType: "NORMAL" | "TARGET_RECONCILIATION";
  resultPercent: string;
  grossResultAmount: string;
  grossProgressAfter: string;
  grossSettlementAmount: string;
  userShareAmount: string;
}

interface EventsPayload extends ApiMessage {
  total: number;
  events: TradeEvent[];
}

async function json<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const value = payload.message;

  if (typeof value === "string") return value;

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return fallback;
}

function money(value: string, currency: string) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function formatAssetSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();

  if (normalized.endsWith("USDT") && normalized.length > 4) {
    return `${normalized.slice(0, -4)}/USDT`;
  }

  return normalized;
}

function utcTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toISOString().slice(11, 19);
}

function tone(status: TradingPackage["status"]) {
  if (status === "ACTIVE") return "success";
  if (status === "BLOCKED") return "danger";
  return "muted";
}

export default function UserTradingClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserPortalSession | null>(null);

  const [packages, setPackages] = useState<TradingPackage[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [history, setHistory] = useState<HistoryQuery>(INITIAL_HISTORY_QUERY);
  const [claims, setClaims] = useState<DailyClaim[]>([]);
  const [claimBusy, setClaimBusy] = useState("");
  const [claimNotice, setClaimNotice] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => packages.find((item) => item.subscriptionId === selectedId) ?? null,
    [packages, selectedId],
  );

  const totalEarned = useMemo(
    () =>
      packages.reduce((sum, item) => sum + Number(item.userCreditedAmount), 0),
    [packages],
  );

  const activeCount = useMemo(
    () => packages.filter((item) => item.status === "ACTIVE").length,
    [packages],
  );

  const dailyClaimsByDate = useMemo(
    () =>
      new Map(
        claims
          .filter((claim) => claim.subscriptionId === selectedId)
          .map((claim) => [claim.localTradeDate, claim] as const),
      ),
    [claims, selectedId],
  );

  const loadClaims = useCallback(async (subscriptionId: string) => {
    const response = await fetch(
      `/api/user/internal-trading/claims?page=1&limit=100&subscriptionId=${encodeURIComponent(subscriptionId)}`,
      {
        cache: 'no-store',
      },
    );
    const payload = await json<ClaimsPayload>(response);
    if (response.ok && payload) {
      setClaims(payload.claims);
      return;
    }
    if (response.status !== 404) {
      throw new Error(messageFrom(payload, 'Unable to load daily claims.'));
    }
  }, []);

  const loadEvents = useCallback(
    async (subscriptionId: string, query: HistoryQuery) => {
      const response = await fetch(
        `/api/user/internal-trading/packages/${encodeURIComponent(
          subscriptionId,
        )}/events?${historyQueryParams(query).toString()}`,
        { cache: "no-store" },
      );

      const payload = await json<EventsPayload>(response);

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Unable to load trade history."));
      }

      return payload;
    },
    [router],
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const sessionResponse = await fetch("/api/user/session", {
          cache: "no-store",
        });

        const userSession = await json<UserPortalSession & ApiMessage>(
          sessionResponse,
        );

        if (sessionResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!sessionResponse.ok || !userSession?.user) {
          throw new Error(
            messageFrom(userSession, "USER session is unavailable."),
          );
        }

        if (!mounted) return;
        setSession(userSession);

        const packageResponse = await fetch(
          "/api/user/internal-trading/packages",
          { cache: "no-store" },
        );

        const packagePayload = await json<PackagesPayload>(packageResponse);

        if (packageResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!packageResponse.ok || !packagePayload) {
          throw new Error(
            messageFrom(
              packagePayload,
              "Unable to load internal trading packages.",
            ),
          );
        }

        if (!mounted) return;

        setPackages(packagePayload.packages);

        if (packagePayload.packages[0]) {
          const id = packagePayload.packages[0].subscriptionId;
          setSelectedId(id);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load trading.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void loadEvents(selectedId, history)
      .then((payload) => {
        if (!cancelled && payload) {
          setEvents(payload.events);
          setEventsTotal(payload.total);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load trade history.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, history, loadEvents]);

  useEffect(() => {
    if (!selectedId) return;
    void loadClaims(selectedId).catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Cannot load profit claims.'),
    );
  }, [selectedId, loadClaims]);

  async function claimProfit(claim: DailyClaim) {
    if (!session || isImpersonationSession(session) || claimBusy) return;
    setClaimBusy(claim.id);
    setError('');
    setClaimNotice('');
    try {
      const response = await fetch(
        `/api/user/internal-trading/claims/${encodeURIComponent(claim.id)}/claim`,
        { method: 'POST', cache: 'no-store' },
      );
      const payload = await json<ApiMessage>(response);
      if (!response.ok) {
        throw new Error(messageFrom(payload, 'Daily profit claim failed.'));
      }
      await loadClaims(claim.subscriptionId);
      const packageResponse = await fetch('/api/user/internal-trading/packages', {
        cache: 'no-store',
      });
      const updated = await json<PackagesPayload>(packageResponse);
      if (packageResponse.ok && updated) setPackages(updated.packages);
      setClaimNotice('Daily profit has been credited to Package Earnings wallet.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Daily claim failed.');
    } finally {
      setClaimBusy('');
    }
  }

  function selectPackage(subscriptionId: string) {
    setError("");
    setEvents([]);
    setEventsTotal(0);
    setClaims([]);
    setHistory((value) => ({ ...value, page: 1 }));
    setSelectedId(subscriptionId);
  }

  if (loading && !session) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading trading…</p>
        </div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>MY INTERNAL TRADING</p>
            <h2>Trading</h2>
            <p>
              Track the independent trading progress, credited earnings and trade
              history for every active package.
            </p>
          </div>

          <span className={styles.modelPill}>PACKAGE-LINKED EARNINGS</span>
        </section>

        {error ? (
          <div className={styles.alert} data-tone="error">
            {error}
          </div>
        ) : null}
        {claimNotice ? (
          <div className={styles.alert} data-tone="success">
            {claimNotice}
          </div>
        ) : null}

        <section className={styles.stats}>
          <div className={styles.stat}>
            <small>Trading packages</small>
            <strong>{packages.length}</strong>
          </div>

          <div className={styles.stat}>
            <small>Active</small>
            <strong>{activeCount}</strong>
          </div>

          <div className={styles.stat}>
            <small>Total credited earnings</small>
            <strong>
              {totalEarned.toLocaleString(undefined, {
                maximumFractionDigits: 8,
              })}
            </strong>
          </div>

          <div className={styles.stat}>
            <small>History records</small>
            <strong>{eventsTotal}</strong>
          </div>

          <div className={styles.stat}>
            <small>Settlement model</small>
            <strong>{selected?.financialModelVersion === 'V2' ? 'Daily manual claim' : 'Legacy immediate settlement'}</strong>
          </div>
        </section>

        <section className={styles.packageGrid}>
          {packages.map((item) => {
            return (
              <article
                key={item.subscriptionId}
                className={styles.packageCard}
                data-selected={selectedId === item.subscriptionId}
                onClick={() => selectPackage(item.subscriptionId)}
              >
                <div className={styles.packageHeader}>
                  <div>
                    <h3>{item.packageDisplayName}</h3>
                    <p className={styles.muted}>Algorithm-generated internal trades</p>
                  </div>

                  <span className={styles.badge} data-tone={tone(item.status)}>
                    {item.status}
                  </span>
                </div>

                <div className={styles.packageMeta}>
                  <div>
                    <small>Principal</small>
                    <strong>
                      {money(item.principalAmount, item.currency)}
                    </strong>
                  </div>

                  <div>
                    <small>Recorded trades</small>
                    <strong>{item.settledTradeCount}</strong>
                  </div>

                  <div>
                    <small>Cumulative trading P&L</small>
                    <strong>
                      {money(item.grossNetProgress, item.currency)}
                    </strong>
                  </div>

                  <div>
                    <small>Credited earnings</small>
                    <strong className={styles.moneyPositive}>
                      {money(item.userCreditedAmount, item.currency)}
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}

          {!packages.length ? (
            <div className={styles.card}>
              <div className={styles.empty}>
                No internal trading package is active yet.
              </div>
            </div>
          ) : null}
        </section>

        {selected ? (
          <section className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>{selected.packageDisplayName} Summary</h3>

                <span
                  className={styles.badge}
                  data-tone={tone(selected.status)}
                >
                  {selected.status}
                </span>
              </div>

              <dl className={styles.detailList}>
                <div>
                  <dt>Principal</dt>
                  <dd>{money(selected.principalAmount, selected.currency)}</dd>
                </div>

                <div>
                  <dt>Trades recorded</dt>
                  <dd>{selected.settledTradeCount}</dd>
                </div>

                <div>
                  <dt>Cumulative signed trading P&L</dt>
                  <dd>{money(selected.grossNetProgress, selected.currency)}</dd>
                </div>

                <div>
                  <dt>Recorded high-water</dt>
                  <dd>
                    {money(selected.grossHighWaterMark, selected.currency)}
                  </dd>
                </div>

                <div>
                  <dt>My credited earnings</dt>
                  <dd className={styles.moneyPositive}>
                    {money(selected.userCreditedAmount, selected.currency)}
                  </dd>
                </div>

                <div>
                  <dt>My package share</dt>
                  <dd>{selected.userSharePercent}%</dd>
                </div>
              </dl>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>Trading Schedule</h3>
              </div>

              <dl className={styles.detailList}>
                <div>
                  <dt>Activation day</dt>
                  <dd>{selected.activationLocalDate}</dd>
                </div>

                <div>
                  <dt>Final day</dt>
                  <dd>{selected.finalLocalDate}</dd>
                </div>

                <div>
                  <dt>Next trading day</dt>
                  <dd>{selected.nextTradeLocalDate}</dd>
                </div>

                <div>
                  <dt>Total trades</dt>
                  <dd>{selected.settledTradeCount}</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}

        {selected?.financialModelVersion === 'V2' ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Daily Profit Claims</h3>
                <p className={styles.muted}>
                  Exactly five algorithm-generated trades complete each daily result.
                  USER share becomes available after day completion and never expires.
                  Your wallet is credited only after you claim.
                </p>
              </div>
            </div>
            {claims.filter((claim) => claim.subscriptionId === selectedId).length === 0 ? (
              <div className={styles.empty}>No completed daily claims yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Day (UTC)</th>
                      <th>Trades</th>
                      <th>Daily NET gross</th>
                      <th>My share</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.filter((claim) => claim.subscriptionId === selectedId).map((claim) => (
                      <tr key={claim.id}>
                        <td>{claim.localTradeDate}</td>
                        <td>{claim.tradeCount}/5</td>
                        <td>{money(claim.dailyNetGrossAmount, claim.currency)}
                          <span className={styles.muted}> ({claim.dailyGrossRatePercent}%)</span>
                        </td>
                        <td className={styles.moneyPositive}>{money(claim.userAmount, claim.currency)}</td>
                        <td>{claim.status}</td>
                        <td>
                          <button
                            type="button"
                            className={claim.status === 'PENDING' ? `${styles.buttonSecondary} ${styles.claimProfitButton}` : styles.buttonSecondary}
                            disabled={claim.status === 'CLAIMED' || Boolean(claimBusy) || Boolean(session && isImpersonationSession(session))}
                            onClick={() => void claimProfit(claim)}
                          >
                            {claim.status === 'CLAIMED'
                              ? 'Claimed'
                              : claimBusy === claim.id
                                ? 'Claiming…'
                                : 'Claim Profit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {session && isImpersonationSession(session) ? (
              <p className={styles.muted}>
                Financial claims are disabled during administrator impersonation.
                Sign in as the account owner to claim.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Trade History</h3>
              <p className={styles.muted}>
                {selected?.financialModelVersion === 'V2'
                  ? 'Algorithm-generated signed trade P&L is recorded here. Wallet credit appears on the fifth trade row only after the daily Claim Profit is completed; no individual trade credits the wallet.'
                  : 'Historical V1 trade results and prior wallet settlements are shown unchanged.'}
              </p>
            </div>

            <span className={styles.badge} data-tone="muted">
              {eventsTotal} TOTAL
            </span>
          </div>

          <HistoryControls
            value={history}
            total={eventsTotal}
            onChange={setHistory}
          />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>UTC Date</th>
                  <th>Time (UTC)</th>
                  <th>Day / Slot</th>
                  <th>Asset</th>
                  <th>Result</th>
                  <th>%</th>
                  <th>Gross result</th>
                  <th>Progress</th>
                  <th>{selected?.financialModelVersion === 'V2' ? 'Daily claim wallet credit' : 'Package Earnings credit'}</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => {
                  const hasAdditionalCredit = Number(event.userShareAmount) > 0;
                  const dailyClaim = event.slotNumber === 5
                    ? dailyClaimsByDate.get(event.localTradeDate)
                    : undefined;

                  return (
                    <tr key={event.id}>
                      <td>{formatPlatformDate(event.scheduledAt)}</td>
                      <td>{utcTime(event.scheduledAt)}</td>
                      <td>
                        D{event.tradeDayNumber} / {event.slotNumber}
                      </td>
                      <td>{formatAssetSymbol(event.assetSymbol)}</td>
                      <td>
                        <span
                          className={
                            event.outcome === "WIN" ? styles.win : styles.loss
                          }
                        >
                          {event.eventType === "TARGET_RECONCILIATION"
                            ? "TARGET CLOSE"
                            : event.outcome}
                        </span>
                      </td>
                      <td>{event.resultPercent}%</td>
                      <td>{event.grossResultAmount}</td>
                      <td>{event.grossProgressAfter}</td>
                      <td>
                        {selected?.financialModelVersion === 'V2' ? (
                          dailyClaim?.status === 'CLAIMED' ? (
                            <>
                              <span className={styles.moneyPositive}>
                                +{dailyClaim.userAmount} {dailyClaim.currency}
                              </span>
                              <span className={styles.claimCreditDetail}>
                                Daily claim credited
                              </span>
                            </>
                          ) : dailyClaim?.status === 'PENDING' ? (
                            <span className={styles.muted}>Pending daily claim</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )
                        ) : (
                          <>
                            <span className={styles.moneyPositive}>{event.userShareAmount}</span>
                            {!hasAdditionalCredit && Number(event.grossResultAmount) > 0 ? (
                              <>
                                <br />
                                <span className={styles.muted}>No additional credit</span>
                              </>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!events.length ? (
                  <tr>
                    <td colSpan={9} className={styles.empty}>
                      No trade history for this package yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
