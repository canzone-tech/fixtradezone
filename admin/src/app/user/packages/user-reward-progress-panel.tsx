"use client";

import { useCallback, useEffect, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import type { MyRewardsResponse } from "@/lib/rewards";
import styles from "./user-reward-progress-panel.module.css";

interface ErrorPayload {
  message?: string | string[];
}

function message(payload: ErrorPayload, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function amountLabel(value: string, currency: string) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function fetchRewards(): Promise<MyRewardsResponse> {
  const response = await fetch("/api/user/rewards?page=1&limit=50", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as
    | MyRewardsResponse
    | ErrorPayload;
  if (!response.ok) {
    throw new Error(message(body as ErrorPayload, "Unable to load package rewards."));
  }
  return body as MyRewardsResponse;
}

export default function UserRewardProgressPanel() {
  const [payload, setPayload] = useState<MyRewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await fetchRewards());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load package rewards.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function initialLoad() {
      try {
        const body = await fetchRewards();
        if (mounted) setPayload(body);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package rewards.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      mounted = false;
    };
  }, []);

  const states = payload?.states ?? [];
  const events = payload?.events ?? [];

  return (
    <section className={styles.panel}>
      {error ? (
        <FlashMessage
          type="error"
          message={error}
          onClose={() => setError("")}
        />
      ) : null}

      <div className={styles.header}>
        <div>
          <span>RWD-01 · LEDGER BACKED</span>
          <h3>Reward & Cap Progress</h3>
          <p>
            Only settled package rewards are shown as earnings. Cap and lifecycle
            progress comes from immutable subscription policy snapshots.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!loading && states.length === 0 ? (
        <div className={styles.empty}>
          <i className="iconoir-trophy" />
          <div>
            <strong>No reward lifecycle state yet</strong>
            <span>
              Reward state begins only when an effective published reward/cap
              policy applies. No historical reward is fabricated.
            </span>
          </div>
        </div>
      ) : null}

      <div className={styles.stateGrid}>
        {states.map((state) => {
          const consumed = Number(state.capConsumed);
          const limit = Number(state.capLimit);
          const percent = limit > 0 ? Math.min(100, (consumed / limit) * 100) : 0;
          return (
            <article className={styles.stateCard} key={state.subscriptionId}>
              <div className={styles.stateHead}>
                <div>
                  <span>{state.packageDisplayName ?? "Package"}</span>
                  <strong>{state.status}</strong>
                </div>
                <b>{state.settledRewardCount} settled</b>
              </div>
              <div className={styles.capNumbers}>
                <div><small>CAP CONSUMED</small><strong>{amountLabel(state.capConsumed, state.currency)}</strong></div>
                <div><small>CAP LIMIT</small><strong>{amountLabel(state.capLimit, state.currency)}</strong></div>
                <div><small>REMAINING</small><strong>{amountLabel(state.capRemaining, state.currency)}</strong></div>
              </div>
              <div className={styles.progressTrack} aria-label={`Cap ${percent.toFixed(1)} percent consumed`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <dl>
                <div><dt>Next reward</dt><dd>{state.status === "ACTIVE" ? dateLabel(state.nextRewardAt) : "—"}</dd></div>
                <div><dt>Natural package day</dt><dd>{state.nextRewardDayNumber}</dd></div>
                <div><dt>Cycle</dt><dd>{state.nextCycleNumber} / day {state.nextCycleDay}</dd></div>
                <div><dt>Cap basis</dt><dd>{state.capBasis.replaceAll("_", " ")}</dd></div>
              </dl>
              {state.blockedReason ? <p className={styles.blocked}>{state.blockedReason}</p> : null}
              {state.completionReason ? <p className={styles.complete}>{state.completionReason.replaceAll("_", " ")}</p> : null}
            </article>
          );
        })}
      </div>

      <div className={styles.eventsHead}>
        <div><span>IMMUTABLE HISTORY</span><h4>Settled package rewards</h4></div>
        <b>{payload?.total ?? 0} total</b>
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyHistory}>
          No package reward has settled yet.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Date</th><th>Package</th><th>Rate</th><th>Posted reward</th><th>Cap after</th><th>Lifecycle</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.rewardLocalDate}<small>Day {event.rewardDayNumber}</small></td>
                  <td>{event.packageDisplayName}<small>Cycle {event.cycleNumber} / day {event.cycleDay}</small></td>
                  <td>{event.selectedRate}%<small>{event.rewardRateMode.replaceAll("_", " ")}</small></td>
                  <td>{amountLabel(event.postedReward, event.currency)}{event.clippedToCap ? <small>Clipped to exact cap headroom</small> : null}</td>
                  <td>{amountLabel(event.capConsumedAfter, event.currency)} / {amountLabel(event.capLimit, event.currency)}</td>
                  <td>{event.completionReason ? event.completionReason.replaceAll("_", " ") : "ACTIVE"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
