"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserPortalSession } from "@/lib/user-session";
import styles from "../../internal-trading/internal-trading.module.css";

interface ApiMessage {
  message?: string | string[];
  redirectTo?: string | null;
}

interface TradingPackage {
  subscriptionId: string;
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

interface TradeEvent {
  id: string;
  localTradeDate: string;
  tradeDayNumber: number;
  slotNumber: number;
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

function percentage(progress: string, target: string) {
  const denominator = Number(target);
  if (!denominator) return 0;

  return Math.max(0, Math.min(100, (Number(progress) / denominator) * 100));
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

  const loadEvents = useCallback(
    async (subscriptionId: string) => {
      const response = await fetch(
        `/api/user/internal-trading/packages/${encodeURIComponent(
          subscriptionId,
        )}/events?page=1&limit=100`,
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

      setEvents(payload.events);
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
          await loadEvents(id);
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
  }, [loadEvents, router]);

  async function selectPackage(subscriptionId: string) {
    setSelectedId(subscriptionId);
    setError("");

    try {
      await loadEvents(subscriptionId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load trade history.",
      );
    }
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
              Track the independent trading progress, earnings and trade history
              for every active package.
            </p>
          </div>

          <span className={styles.modelPill}>PACKAGE-LINKED EARNINGS</span>
        </section>

        {error ? (
          <div className={styles.alert} data-tone="error">
            {error}
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
            <small>Total earned</small>
            <strong>
              {totalEarned.toLocaleString(undefined, {
                maximumFractionDigits: 8,
              })}
            </strong>
          </div>

          <div className={styles.stat}>
            <small>Loaded trades</small>
            <strong>{events.length}</strong>
          </div>

          <div className={styles.stat}>
            <small>Settlement model</small>
            <strong>Immediate WIN</strong>
          </div>
        </section>

        <section className={styles.packageGrid}>
          {packages.map((item) => {
            const progress = percentage(
              item.grossNetProgress,
              item.grossTarget,
            );

            return (
              <article
                key={item.subscriptionId}
                className={styles.packageCard}
                data-selected={selectedId === item.subscriptionId}
                onClick={() => void selectPackage(item.subscriptionId)}
              >
                <div className={styles.packageHeader}>
                  <div>
                    <h3>{item.packageDisplayName}</h3>
                    <p className={styles.muted}>
                      {item.grossMultiplier}x gross target
                    </p>
                  </div>

                  <span className={styles.badge} data-tone={tone(item.status)}>
                    {item.status}
                  </span>
                </div>

                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBar}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className={styles.packageMeta}>
                  <div>
                    <small>Principal</small>
                    <strong>
                      {money(item.principalAmount, item.currency)}
                    </strong>
                  </div>

                  <div>
                    <small>Gross target</small>
                    <strong>{money(item.grossTarget, item.currency)}</strong>
                  </div>

                  <div>
                    <small>Progress</small>
                    <strong>
                      {money(item.grossNetProgress, item.currency)}
                    </strong>
                  </div>

                  <div>
                    <small>My earnings</small>
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
                  <dt>Gross target</dt>
                  <dd>{money(selected.grossTarget, selected.currency)}</dd>
                </div>

                <div>
                  <dt>Current progress</dt>
                  <dd>{money(selected.grossNetProgress, selected.currency)}</dd>
                </div>

                <div>
                  <dt>Progress high-water</dt>
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

                <div>
                  <dt>Trading timezone</dt>
                  <dd>{selected.timezoneSnapshot}</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Trade History</h3>
              <p className={styles.muted}>
                Package-by-package trading results with WIN earnings credited to
                your wallet.
              </p>
            </div>

            <span className={styles.badge} data-tone="muted">
              {events.length} LOADED
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day / Slot</th>
                  <th>Asset</th>
                  <th>Result</th>
                  <th>%</th>
                  <th>Gross result</th>
                  <th>Progress</th>
                  <th>My earning</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.localTradeDate}</td>
                    <td>
                      D{event.tradeDayNumber} / {event.slotNumber}
                    </td>
                    <td>{event.assetSymbol}</td>
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
                    <td className={styles.moneyPositive}>
                      {event.userShareAmount}
                    </td>
                  </tr>
                ))}

                {!events.length ? (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
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
