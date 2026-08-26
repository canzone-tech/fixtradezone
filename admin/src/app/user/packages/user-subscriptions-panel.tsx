"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./user-subscriptions-panel.module.css";

interface Subscription {
  id: string;
  sourceDepositId: string;
  packageCode: string;
  packageDisplayName: string;
  price: string;
  currency: string;
  status: string;
  activatedAt: string;
  scheduledEndAt: string;
  goalDays: number;
  cycleDays: number;
  principalTreatment: string;
}

interface ResponsePayload {
  active?: Subscription[];
  history?: Subscription[];
  message?: string | string[];
}

function message(payload: ResponsePayload, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UserSubscriptionsPanel() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ResponsePayload>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user/subscriptions?limit=100", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as ResponsePayload;
      if (!response.ok) {
        throw new Error(message(body, "Unable to load package subscriptions."));
      }
      setPayload(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load package subscriptions.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = payload.active ?? [];
  const history = payload.history ?? [];

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span>SUB-01 / MY PACKAGE</span>
          <h3>My Active Package</h3>
          <p>
            Activated package principal is held in package accounting and is no
            longer part of freely available Main / Deposit balance.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && active.length === 0 ? (
        <div className={styles.empty}>
          <i className="iconoir-box" />
          <div>
            <strong>No active package</strong>
            <span>
              An eligible approved and accounted payment activates its package
              through the audited subscription workflow.
            </span>
          </div>
        </div>
      ) : null}

      {active.map((item) => (
        <article className={styles.activeCard} key={item.id}>
          <div className={styles.identity}>
            <span>{item.packageCode}</span>
            <h4>{item.packageDisplayName}</h4>
            <strong>
              {item.price} {item.currency}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd className={styles.status}>{item.status}</dd>
            </div>
            <div>
              <dt>Activated</dt>
              <dd>{dateLabel(item.activatedAt)}</dd>
            </div>
            <div>
              <dt>Scheduled end</dt>
              <dd>{dateLabel(item.scheduledEndAt)}</dd>
            </div>
            <div>
              <dt>Goal / cycle</dt>
              <dd>
                {item.goalDays}d / {item.cycleDays}d
              </dd>
            </div>
          </dl>
          <small className={styles.source}>
            Source deposit: {item.sourceDepositId}
          </small>
        </article>
      ))}

      {history.length > 0 ? (
        <div className={styles.historyNote}>
          <i className="iconoir-history" />
          {history.length} immutable activation record
          {history.length === 1 ? "" : "s"} retained.
        </div>
      ) : null}
    </section>
  );
}
