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

interface RewardState {
  subscriptionId: string;
  packageDisplayName?: string;
  currency: string;
  packageValue: string;
  capBasis: string;
  capMultiplier: string;
  capLimit: string;
  capConsumed: string;
  capRemaining: string;
  nextRewardLocalDate: string;
  nextRewardAt: string;
  nextRewardDayNumber: number;
  nextCycleNumber: number;
  nextCycleDay: number;
  settledRewardCount: number;
  status: "ACTIVE" | "COMPLETED" | "BLOCKED";
  completionReason: string | null;
  blockedReason: string | null;
  completedAt: string | null;
}

interface RewardEvent {
  id: string;
  subscriptionId: string;
  packageDisplayName: string;
  packageValue: string;
  currency: string;
  rewardLocalDate: string;
  rewardDayNumber: number;
  cycleNumber: number;
  cycleDay: number;
  selectedRate: string;
  calculatedReward: string;
  postedReward: string;
  capLimit: string;
  capConsumedBefore: string;
  capConsumedAfter: string;
  clippedToCap: boolean;
  completionReason: string | null;
  postedAt: string;
}

interface RewardsResponse extends UserApiPayload {
  states: RewardState[];
  events: RewardEvent[];
  page: number;
  limit: number;
  total: number;
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

function stateTone(status: RewardState["status"]): "success" | "warning" | undefined {
  if (status === "ACTIVE" || status === "COMPLETED") return "success";
  if (status === "BLOCKED") return "warning";
  return undefined;
}

function awardTone(
  status: AwardTrack["status"],
): "success" | "warning" | undefined {
  if (status === "CLOSED" || status === "AWARD_POSTED") return "success";
  if (status === "QUALIFIED") return "warning";
  return undefined;
}

export default function UserRewardsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [data, setData] = useState<RewardsResponse | null>(null);
  const [awardData, setAwardData] = useState<AwardRewardsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number) => {
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

        const [rewardsResponse, awardResponse] = await Promise.all([
          fetch(`/api/user/rewards?page=${nextPage}&limit=50`, {
            cache: "no-store",
          }),
          fetch("/api/user/award-rewards", { cache: "no-store" }),
        ]);
        const rewards = await checked<RewardsResponse>(
          rewardsResponse,
          "Could not load rewards and cap progress.",
        );
        const awards = await checked<AwardRewardsResponse>(
          awardResponse,
          "Could not load Team Business Award & Reward progress.",
        );

        setSession(nextSession);
        setData(rewards);
        setAwardData(awards);
        setPage(rewards.page);
      } catch (caught) {
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load rewards and cap progress.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const awardAsset = awardData?.effectivePolicy?.asset ?? "USDT";

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
          <p className={styles.eyebrow}>RWD-01 / USER REWARDS</p>
          <h1>Rewards & Caps</h1>
          <p>
            View package reward lifecycle state, cap consumption, upcoming
            settlement position, immutable posted reward history, and your
            sequential Team Business Award & Reward track.
          </p>
        </section>

        <section className={styles.card}>
          <p className={styles.eyebrow}>Lifecycle</p>
          <h2>Package reward states</h2>

          {loading && !data ? (
            <div className={styles.empty}>Loading reward lifecycle…</div>
          ) : !data?.states.length ? (
            <div className={styles.empty}>
              No package reward lifecycle state exists yet.
            </div>
          ) : (
            <div className={styles.page}>
              {data.states.map((state) => (
                <article className={styles.notification} key={state.subscriptionId}>
                  <div className={styles.notificationHeader}>
                    <div>
                      <strong>{state.packageDisplayName ?? "Package"}</strong>
                      <div className={styles.meta}>
                        {compactDecimal(state.packageValue)} {state.currency} package value
                      </div>
                    </div>
                    <span
                      className={styles.badge}
                      data-tone={stateTone(state.status)}
                    >
                      {state.status}
                    </span>
                  </div>

                  <div className={styles.grid}>
                    <div className={styles.metric}>
                      <small>Cap limit</small>
                      <strong>
                        {compactDecimal(state.capLimit)} {state.currency}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Consumed</small>
                      <strong>
                        {compactDecimal(state.capConsumed)} {state.currency}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Remaining</small>
                      <strong>
                        {compactDecimal(state.capRemaining)} {state.currency}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Settled rewards</small>
                      <strong>{state.settledRewardCount}</strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Next position</small>
                      <strong>
                        Day {state.nextRewardDayNumber} · Cycle {state.nextCycleNumber}/{state.nextCycleDay}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Next reward</small>
                      <strong>{formatPlatformDateTime(state.nextRewardAt)}</strong>
                    </div>
                  </div>

                  {state.blockedReason ? (
                    <p className={styles.statusBad}>Blocked: {state.blockedReason}</p>
                  ) : null}
                  {state.completionReason ? (
                    <p className={styles.statusGood}>
                      Completion: {state.completionReason}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>AWR-01 / TEAM BUSINESS ACHIEVEMENT</p>
              <h2>Sequential Award & Reward track</h2>
              <p>
                Every eligible ACTIVE package gets its own award track in policy
                order. A later package remains waiting until the previous award
                posts and closes; the new track then starts from zero.
              </p>
            </div>
            <span className={styles.badge} data-tone="success">
              Rewards wallet: {compactDecimal(awardData?.rewardsWalletBalance ?? "0")} {awardAsset}
            </span>
          </div>

          {loading && !awardData ? (
            <div className={styles.empty}>Loading Award & Reward progress…</div>
          ) : !awardData?.effectivePolicy ? (
            <div className={styles.empty}>
              No enabled published Award & Reward policy is effective yet.
            </div>
          ) : (
            <div className={styles.page}>
              {awardData.currentTrack ? (
                <article className={styles.notification}>
                  <div className={styles.notificationHeader}>
                    <div>
                      <strong>{awardData.currentTrack.packageDisplayName}</strong>
                      <div className={styles.meta}>
                        Track #{awardData.currentTrack.trackOrder} · {awardData.currentTrack.packageCode} · started {formatPlatformDateTime(awardData.currentTrack.startedAt)}
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <span className={styles.badge} data-tone={awardTone(awardData.currentTrack.status)}>
                        {awardData.currentTrack.status}
                      </span>
                      <span className={styles.badge}>
                        Award {compactDecimal(awardData.currentTrack.awardAmount)} {awardData.currentTrack.currency}
                      </span>
                    </div>
                  </div>

                  <div className={styles.grid}>
                    {(awardData.currentTrack.levels ?? []).map((level) => (
                      <div className={styles.metric} key={level.levelNumber}>
                        <small>Level {level.levelNumber}</small>
                        {level.required ? (
                          <>
                            <strong>
                              {compactDecimal(level.currentBusiness)} / {compactDecimal(level.requiredBusiness ?? "0")} {awardData.currentTrack?.currency}
                            </strong>
                            <span className={styles.meta}>
                              {compactDecimal(level.progressPercent)}% · {level.achieved ? "ACHIEVED" : "IN PROGRESS"}
                            </span>
                          </>
                        ) : (
                          <>
                            <strong>NOT_REQUIRED</strong>
                            <span className={styles.meta}>No target on this genealogy level</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ) : (
                <div className={styles.empty}>
                  No Award & Reward package track is currently open.
                </div>
              )}

              {awardData.waitingTracks.length > 0 ? (
                <article className={styles.notification}>
                  <div className={styles.notificationHeader}>
                    <div>
                      <strong>Waiting package tracks</strong>
                      <div className={styles.meta}>
                        These tracks do not count Team Business yet. Each starts
                        from zero only after the prior track closes.
                      </div>
                    </div>
                    <span className={styles.badge}>
                      {awardData.waitingTracks.length} WAITING
                    </span>
                  </div>
                  <div className={styles.grid}>
                    {awardData.waitingTracks.map((track) => (
                      <div className={styles.metric} key={track.sourceSubscriptionId}>
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

              {awardData.completedTracks.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Completed Package</th>
                        <th>Track</th>
                        <th>Award</th>
                        <th>Started</th>
                        <th>Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awardData.completedTracks.map((track) => (
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
              ) : null}

              {awardData.events.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Award Event</th>
                        <th>Amount</th>
                        <th>Posted</th>
                        <th>Ledger Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awardData.events.map((event) => (
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
              ) : null}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable History</p>
              <h2>Package reward events</h2>
              <p>{data?.total ?? 0} event(s)</p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={loading || page <= 1}
                onClick={() => void load(page - 1)}
              >
                Previous
              </button>
              <span className={styles.meta}>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={loading || page >= totalPages}
                onClick={() => void load(page + 1)}
              >
                Next
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div className={styles.empty}>Loading reward history…</div>
          ) : !data?.events.length ? (
            <div className={styles.empty}>No reward events to show.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Reward Date</th>
                    <th>Position</th>
                    <th>Rate</th>
                    <th>Calculated</th>
                    <th>Posted</th>
                    <th>Cap After</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.packageDisplayName}</strong>
                        <div className={styles.meta}>
                          {compactDecimal(event.packageValue)} {event.currency}
                        </div>
                      </td>
                      <td>{event.rewardLocalDate}</td>
                      <td>
                        Day {event.rewardDayNumber} · Cycle {event.cycleNumber}/{event.cycleDay}
                      </td>
                      <td>{compactDecimal(event.selectedRate)}%</td>
                      <td>
                        {compactDecimal(event.calculatedReward)} {event.currency}
                      </td>
                      <td>
                        <strong>
                          {compactDecimal(event.postedReward)} {event.currency}
                        </strong>
                        {event.clippedToCap ? (
                          <div className={styles.meta}>Clipped to cap</div>
                        ) : null}
                      </td>
                      <td>
                        {compactDecimal(event.capConsumedAfter)} / {compactDecimal(event.capLimit)} {event.currency}
                      </td>
                      <td>{formatPlatformDateTime(event.postedAt)}</td>
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
