"use client";

import { useCallback, useEffect, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { enumLabel } from "@/lib/packages";
import styles from "./subscriptions.module.css";

type SubscriptionStatus = "ACTIVE" | "COMPLETED" | "SUPERSEDED" | "CANCELLED";

interface Subscription {
  id: string;
  userId: string;
  username?: string;
  email?: string | null;
  sourceDepositId: string;
  sourceDepositAccountingTransactionId: string;
  fundingLedgerTransactionId: string;
  packageCode: string;
  packageDisplayName: string;
  price: string;
  currency: string;
  activePackageMode: string;
  activationTrigger: string;
  principalTreatment: string;
  goalDays: number;
  cycleDays: number;
  status: SubscriptionStatus;
  activatedAt: string;
  scheduledEndAt: string;
}

interface PendingActivation {
  depositId: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  amount: string;
  currency: string;
  reviewedAt: string | null;
  accountingTransactionId: string;
  activePackageMode: string;
  activationTrigger: string;
}

interface ListResponse {
  subscriptions: Subscription[];
  total: number;
}

interface PendingResponse {
  deposits: PendingActivation[];
  total: number;
}

interface ApiError {
  message?: string | string[];
}

interface SubscriptionSnapshot {
  pending: PendingActivation[];
  subscriptions: Subscription[];
}

function apiMessage(payload: ApiError, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function activationActionEnabled(trigger: string) {
  return trigger === "MANUAL_ACTIVATION" || trigger === "PAYMENT_APPROVED";
}

function activationActionLabel(trigger: string) {
  if (trigger === "MANUAL_ACTIVATION") return "Activate package";
  if (trigger === "PAYMENT_APPROVED") return "Reconcile activation";
  return "Awaiting activation engine";
}

async function fetchSubscriptionSnapshot(): Promise<SubscriptionSnapshot> {
  const pendingResponse = await fetch(
    "/api/admin/subscriptions/activation-pending?limit=100",
    { cache: "no-store" },
  );
  const pendingPayload = (await pendingResponse
    .json()
    .catch(() => ({}))) as PendingResponse & ApiError;
  if (!pendingResponse.ok) {
    throw new Error(
      apiMessage(pendingPayload, "Unable to load activation queue."),
    );
  }

  const listResponse = await fetch("/api/admin/subscriptions?limit=100", {
    cache: "no-store",
  });
  const listPayload = (await listResponse
    .json()
    .catch(() => ({}))) as ListResponse & ApiError;
  if (!listResponse.ok) {
    throw new Error(apiMessage(listPayload, "Unable to load subscriptions."));
  }

  return {
    pending: pendingPayload.deposits ?? [],
    subscriptions: listPayload.subscriptions ?? [],
  };
}

export default function SubscriptionsClient() {
  const [loading, setLoading] = useState(true);
  const [busyDepositId, setBusyDepositId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pending, setPending] = useState<PendingActivation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchSubscriptionSnapshot();
      setPending(snapshot.pending);
      setSubscriptions(snapshot.subscriptions);
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

    async function loadInitialSnapshot() {
      try {
        const snapshot = await fetchSubscriptionSnapshot();
        if (!mounted) return;
        setPending(snapshot.pending);
        setSubscriptions(snapshot.subscriptions);
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

    void loadInitialSnapshot();

    return () => {
      mounted = false;
    };
  }, []);

  async function reconcile(depositId: string) {
    setBusyDepositId(depositId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/deposits/${encodeURIComponent(depositId)}/activate-package`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as
        { message?: string } | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Package activation failed."),
        );
      }
      setSuccess(
        "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "Package activation completed.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Package activation failed.",
      );
    } finally {
      setBusyDepositId(null);
    }
  }

  return (
    <section className={styles.page}>
      {error ? (
        <FlashMessage
          message={error}
          type="error"
          onClose={() => setError(null)}
        />
      ) : null}
      {success ? (
        <FlashMessage
          message={success}
          type="success"
          autoDismissMs={5000}
          onClose={() => setSuccess(null)}
        />
      ) : null}

      <header className={styles.hero}>
        <div>
          <span>SUB-01 / PACKAGE LIFECYCLE</span>
          <h1>Subscriptions</h1>
          <p>
            Manage policy-driven package activations and inspect the exact
            immutable package snapshot retained for each USER.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className={styles.summaryGrid}>
        <article>
          <small>Activation Pending</small>
          <strong>{pending.length}</strong>
          <span>
            Approved + accounted, waiting on configured activation policy
          </span>
        </article>
        <article>
          <small>Subscriptions</small>
          <strong>{subscriptions.length}</strong>
          <span>Immutable activation records</span>
        </article>
        <article>
          <small>Active</small>
          <strong>
            {subscriptions.filter((item) => item.status === "ACTIVE").length}
          </strong>
          <span>Current active packages</span>
        </article>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span>RECOVERY / RECONCILIATION</span>
            <h2>Activation Pending</h2>
          </div>
          <small>
            MANUAL_ACTIVATION is an intentional operator step. PAYMENT_APPROVED
            entries here are recovery cases. Rule-driven triggers remain
            disabled until their dedicated activation engine is implemented.
          </small>
        </div>

        {pending.length === 0 ? (
          <div className={styles.empty}>No activations are waiting.</div>
        ) : (
          <div className={styles.list}>
            {pending.map((item) => (
              <article className={styles.pendingRow} key={item.depositId}>
                <div>
                  <strong>
                    {item.username} · {item.packageDisplayName}
                  </strong>
                  <span>{item.email ?? item.userId}</span>
                  <small>
                    {enumLabel(item.activePackageMode)} ·{" "}
                    {enumLabel(item.activationTrigger)}
                  </small>
                </div>
                <div>
                  <small>Principal</small>
                  <strong>
                    {item.amount} {item.currency}
                  </strong>
                </div>
                <div>
                  <small>Approved</small>
                  <strong>{dateLabel(item.reviewedAt)}</strong>
                </div>
                <button
                  type="button"
                  disabled={
                    busyDepositId === item.depositId ||
                    !activationActionEnabled(item.activationTrigger)
                  }
                  onClick={() => void reconcile(item.depositId)}
                >
                  {busyDepositId === item.depositId
                    ? "Activating…"
                    : activationActionLabel(item.activationTrigger)}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span>IMMUTABLE USER PACKAGE HISTORY</span>
            <h2>Package subscriptions</h2>
          </div>
          <small>
            No commission, reward, cap, or simulated-trade value is created by
            SUB-01.
          </small>
        </div>

        {subscriptions.length === 0 ? (
          <div className={styles.empty}>No package subscriptions yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>USER</th>
                  <th>PACKAGE</th>
                  <th>PRINCIPAL</th>
                  <th>STATUS</th>
                  <th>PACKAGE MODE</th>
                  <th>ACTIVATION</th>
                  <th>ACTIVATED</th>
                  <th>SCHEDULED END</th>
                  <th>SOURCE DEPOSIT</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.username ?? item.userId}</strong>
                      <small>{item.email ?? item.userId}</small>
                    </td>
                    <td>
                      <strong>{item.packageDisplayName}</strong>
                      <small>{item.packageCode}</small>
                    </td>
                    <td>
                      {item.price} {item.currency}
                    </td>
                    <td>
                      <span className={styles.status}>{item.status}</span>
                    </td>
                    <td>{enumLabel(item.activePackageMode)}</td>
                    <td>{enumLabel(item.activationTrigger)}</td>
                    <td>{dateLabel(item.activatedAt)}</td>
                    <td>{dateLabel(item.scheduledEndAt)}</td>
                    <td className={styles.mono}>{item.sourceDepositId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
