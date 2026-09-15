"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/closeout/closeout.module.css";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";

interface UserApiPayload {
  message?: string;
  redirectTo?: string | null;
}

interface AwardLevelProgress {
  levelNumber: number;
  requiredBusiness: string | null;
  currentBusiness: string;
  required: boolean;
  achieved: boolean;
  achievedAt: string | null;
  progressPercent: string;
}

interface AwardTrack {
  id: string;
  packageCode: string;
  packageDisplayName: string;
  trackOrder: number;
  awardAmount: string;
  currency: string;
  levelCount: number;
  status: "ACTIVE_TRACK" | "QUALIFIED" | "AWARD_POSTED" | "CLOSED";
  startedAt: string;
  qualifiedAt: string | null;
  awardPostedAt: string | null;
  closedAt: string | null;
  ledgerTransactionId: string | null;
  levels?: AwardLevelProgress[];
}

interface WaitingAwardTrack {
  sourceSubscriptionId: string;
  packageDefinitionId: string;
  packageCode: string;
  packageDisplayName: string;
  trackOrder: number;
  awardAmount: string;
  status: "WAITING";
}

interface AwardEvent {
  id: string;
  packageCode: string;
  packageDisplayName: string;
  awardAmount: string;
  currency: string;
  ledgerTransactionId: string;
  postedAt: string;
}

interface AwardPolicySummary {
  id: string;
  versionNumber: number;
  status: "DRAFT" | "PUBLISHED";
  enabled: boolean;
  levelCount: number;
  asset: string;
}

interface AwardRewardsResponse extends UserApiPayload {
  currentTrack: AwardTrack | null;
  waitingTracks: WaitingAwardTrack[];
  completedTracks: AwardTrack[];
  events: AwardEvent[];
  effectivePolicy: AwardPolicySummary | null;
  rewardsWalletBalance: string;
}

class UserAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserAccessError";
  }
}

async function checked<T extends UserApiPayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;

  if (response.status === 401 || response.status === 403) {
    throw new UserAccessError(
      payload?.message ?? fallback,
      response.status,
      payload?.redirectTo ?? null,
    );
  }

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? fallback);
  }

  return payload;
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

function compactDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function awardTone(
  status: AwardTrack["status"],
): "success" | "warning" | undefined {
  if (status === "CLOSED" || status === "AWARD_POSTED") return "success";
  if (status === "QUALIFIED") return "warning";
  return undefined;
}

export default function UserAwardRewardsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [data, setData] = useState<AwardRewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sessionResponse = await fetch("/api/user/session", {
        cache: "no-store",
      });
      const nextSession = await checked<UserDirectSession & UserApiPayload>(
        sessionResponse,
        "USER session is unavailable.",
      );

      const awardResponse = await fetch("/api/user/award-rewards", {
        cache: "no-store",
      });
      const awards = await checked<AwardRewardsResponse>(
        awardResponse,
        "Could not load Team Business Awards progress.",
      );

      setSession(nextSession);
      setData(awards);
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load Team Business Awards progress.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const awardAsset = data?.effectivePolicy?.asset ?? "USDT";

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        {error ? (
          <FlashMessage
            message={error}
            type="error"
            onClose={() => setError(null)}
          />
        ) : null}

        <section className={styles.hero}>
          <p className={styles.eyebrow}>AWR-01 / TEAM BUSINESS ACHIEVEMENT</p>
          <h1>Team Business Awards</h1>
          <p>
            Track package-by-package Team Business achievement. Every eligible
            ACTIVE package runs in policy order; the next track starts from zero
            only after the previous award posts and closes.
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Sequential Processing</p>
              <h2>My Team Business Awards track</h2>
              <p>
                Team Business is measured independently at each required
                genealogy level. Waiting packages do not begin counting until
                their own track starts.
              </p>
            </div>
            <div className={styles.actions}>
              {data?.effectivePolicy ? (
                <span className={styles.badge}>
                  Policy V{data.effectivePolicy.versionNumber} · {data.effectivePolicy.levelCount} level(s)
                </span>
              ) : null}
              <span className={styles.badge} data-tone="success">
                Rewards wallet: {compactDecimal(data?.rewardsWalletBalance ?? "0")} {awardAsset}
              </span>
            </div>
          </div>

          {loading && !data ? (
            <div className={styles.empty}>Loading Team Business Awards progress…</div>
          ) : !data?.effectivePolicy ? (
            <div className={styles.empty}>
              No enabled published Team Business Awards policy is effective yet.
            </div>
          ) : (
            <div className={styles.page}>
              {data.currentTrack ? (
                <article className={styles.notification}>
                  <div className={styles.notificationHeader}>
                    <div>
                      <strong>{data.currentTrack.packageDisplayName}</strong>
                      <div className={styles.meta}>
                        Track #{data.currentTrack.trackOrder} · {data.currentTrack.packageCode} · started {formatPlatformDateTime(data.currentTrack.startedAt)}
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <span
                        className={styles.badge}
                        data-tone={awardTone(data.currentTrack.status)}
                      >
                        {data.currentTrack.status}
                      </span>
                      <span className={styles.badge}>
                        Award {compactDecimal(data.currentTrack.awardAmount)} {data.currentTrack.currency}
                      </span>
                    </div>
                  </div>

                  <div className={styles.grid}>
                    {(data.currentTrack.levels ?? []).map((level) => (
                      <div className={styles.metric} key={level.levelNumber}>
                        <small>Level {level.levelNumber}</small>
                        {level.required ? (
                          <>
                            <strong>
                              {compactDecimal(level.currentBusiness)} / {compactDecimal(level.requiredBusiness ?? "0")} {data.currentTrack?.currency}
                            </strong>
                            <span className={styles.meta}>
                              {compactDecimal(level.progressPercent)}% · {level.achieved ? "ACHIEVED" : "IN PROGRESS"}
                            </span>
                            {level.achievedAt ? (
                              <span className={styles.meta}>
                                Achieved {formatPlatformDateTime(level.achievedAt)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <strong>NOT_REQUIRED</strong>
                            <span className={styles.meta}>
                              No target on this genealogy level
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ) : (
                <div className={styles.empty}>
                  No Team Business Awards package track is currently open.
                </div>
              )}

              {data.waitingTracks.length > 0 ? (
                <article className={styles.notification}>
                  <div className={styles.notificationHeader}>
                    <div>
                      <strong>Waiting package tracks</strong>
                      <div className={styles.meta}>
                        These packages are eligible but do not count Team
                        Business yet. Each starts from zero after the prior track
                        closes.
                      </div>
                    </div>
                    <span className={styles.badge}>
                      {data.waitingTracks.length} WAITING
                    </span>
                  </div>

                  <div className={styles.grid}>
                    {data.waitingTracks.map((track) => (
                      <div
                        className={styles.metric}
                        key={track.sourceSubscriptionId}
                      >
                        <small>Track #{track.trackOrder}</small>
                        <strong>{track.packageDisplayName}</strong>
                        <span className={styles.meta}>
                          {track.packageCode} · award {compactDecimal(track.awardAmount)} {awardAsset}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable History</p>
              <h2>Completed award tracks</h2>
              <p>{data?.completedTracks.length ?? 0} closed track(s)</p>
            </div>
          </div>

          {loading && !data ? (
            <div className={styles.empty}>Loading completed tracks…</div>
          ) : !data?.completedTracks.length ? (
            <div className={styles.empty}>No completed award tracks yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Track</th>
                    <th>Award</th>
                    <th>Started</th>
                    <th>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.completedTracks.map((track) => (
                    <tr key={track.id}>
                      <td>
                        <strong>{track.packageDisplayName}</strong>
                        <div className={styles.meta}>{track.packageCode}</div>
                      </td>
                      <td>#{track.trackOrder}</td>
                      <td>
                        {compactDecimal(track.awardAmount)} {track.currency}
                      </td>
                      <td>{formatPlatformDateTime(track.startedAt)}</td>
                      <td>{formatPlatformDateTime(track.closedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Award Ledger History</p>
              <h2>Posted award events</h2>
              <p>{data?.events.length ?? 0} event(s)</p>
            </div>
          </div>

          {loading && !data ? (
            <div className={styles.empty}>Loading award events…</div>
          ) : !data?.events.length ? (
            <div className={styles.empty}>No posted award events yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Amount</th>
                    <th>Posted</th>
                    <th>Ledger Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.packageDisplayName}</strong>
                        <div className={styles.meta}>{event.packageCode}</div>
                      </td>
                      <td>
                        {compactDecimal(event.awardAmount)} {event.currency}
                      </td>
                      <td>{formatPlatformDateTime(event.postedAt)}</td>
                      <td className={styles.meta}>{event.ledgerTransactionId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
