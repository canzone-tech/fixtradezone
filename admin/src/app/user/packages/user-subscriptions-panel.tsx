"use client";

import { useCallback, useEffect, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { enumLabel } from "@/lib/packages";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./user-subscriptions-panel.module.css";

interface Subscription {
  id: string;
  sourceDepositId: string | null;
  fundingLedgerTransactionId: string;
  packageCode: string;
  packageDisplayName: string;
  price: string;
  currency: string;
  activePackageMode: string;
  multipleActivePackageBasis: string;
  activationTrigger: string;
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
  return formatPlatformDateTime(value);
}

// Keep initial loading separate from manual refresh so React effects stay passive.
async function fetchSubscriptions(): Promise<ResponsePayload> {
  const response = await fetch("/api/user/subscriptions?limit=100", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as ResponsePayload;
  if (!response.ok) {
    throw new Error(message(body, "Unable to load package subscriptions."));
  }
  return body;
}

export default function UserSubscriptionsPanel() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ResponsePayload>({});
  const [error, setError] = useState("");
  const [expandedSubscriptionId, setExpandedSubscriptionId] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await fetchSubscriptions());
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
    let mounted = true;

    async function loadInitialSubscriptions() {
      try {
        const body = await fetchSubscriptions();
        if (!mounted) return;
        setPayload(body);
      } catch (caught) {
        if (!mounted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load package subscriptions.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitialSubscriptions();

    return () => {
      mounted = false;
    };
  }, []);

  const active = payload.active ?? [];
  const history = payload.history ?? [];

  return (
    <section className={styles.panel}>
      {error ? (
        <FlashMessage
          message={error}
          type="error"
          onClose={() => setError("")}
        />
      ) : null}

      <div className={styles.header}>
        <div>
          <span>SUB-02 / MY PACKAGES</span>
          <h3>My Active Packages</h3>
          <p>
            Activated package principal is held in package accounting and is no
            longer part of freely available Main / Deposit balance.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!loading && active.length === 0 ? (
        <div className={styles.empty}>
          <i className="iconoir-box" />
          <div>
            <strong>No active packages</strong>
            <span>
              Package activation follows the exact policy snapshot of the
              published plan used for the payment.
            </span>
          </div>
        </div>
      ) : null}

      {active.map((item) => {
        const expanded = expandedSubscriptionId === item.id;
        const detailsId = `active-package-details-${item.id}`;

        return (
          <article className={styles.activeCard} key={item.id}>
            <div className={styles.identity}>
              <span>{item.packageCode}</span>
              <h4>{item.packageDisplayName}</h4>
              <strong>
                {item.price} {item.currency}
              </strong>
              <small className={styles.mobileStatus}>{item.status}</small>
            </div>

            <button
              type="button"
              className={styles.mobileToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() =>
                setExpandedSubscriptionId((current) =>
                  current === item.id ? null : item.id,
                )
              }
            >
              <span>
                {expanded ? "Hide package details" : "View package details"}
              </span>
              <i
                className={
                  expanded
                    ? "iconoir-nav-arrow-up"
                    : "iconoir-nav-arrow-down"
                }
                aria-hidden="true"
              />
            </button>

            <div
              id={detailsId}
              className={`${styles.subscriptionDetails} ${
                expanded ? styles.subscriptionDetailsExpanded : ""
              }`}
            >
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
                <div>
                  <dt>Package mode</dt>
                  <dd>{enumLabel(item.activePackageMode)}</dd>
                </div>
                <div>
                  <dt>Activation</dt>
                  <dd>{enumLabel(item.activationTrigger)}</dd>
                </div>
              </dl>
              <small className={styles.source}>
                {item.sourceDepositId
                  ? `Source deposit: ${item.sourceDepositId}`
                  : `Source reinvestment: ${item.fundingLedgerTransactionId}`}
              </small>
            </div>
          </article>
        );
      })}

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
