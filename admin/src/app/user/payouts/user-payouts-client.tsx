"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/payouts/payout.module.css";
import type { UserDirectSession } from "@/lib/user-session";
import {
  type ApiMessagePayload,
  type CurrentPayoutPolicyResponse,
  type PayoutBucket,
  type PayoutRequest,
  type UserPayoutsResponse,
  compactPayoutDecimal,
  formatPayoutDate,
  messageFrom,
  payoutBucketLabel,
  payoutStatusTone,
  readJson,
} from "@/lib/payouts";

interface UserApiPayload extends ApiMessagePayload {
  redirectTo?: string | null;
}

class UserPayoutAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserPayoutAccessError";
  }
}

async function checkedJson<T extends UserApiPayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);

  if (response.status === 401 || response.status === 403) {
    throw new UserPayoutAccessError(
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
  if (!(error instanceof UserPayoutAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

async function fetchPayoutWorkspace(): Promise<{
  session: UserDirectSession;
  policy: CurrentPayoutPolicyResponse;
  payouts: UserPayoutsResponse;
}> {
  const sessionResponse = await fetch("/api/user/session", {
    cache: "no-store",
  });
  const session = await checkedJson<UserDirectSession & UserApiPayload>(
    sessionResponse,
    "USER session is unavailable.",
  );

  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  const policyResponse = await fetch("/api/user/payouts/policy", {
    cache: "no-store",
  });
  const policy = await checkedJson<
    CurrentPayoutPolicyResponse & UserApiPayload
  >(policyResponse, "Could not load payout policy.");

  const payoutsResponse = await fetch("/api/user/payouts?limit=50", {
    cache: "no-store",
  });
  const payouts = await checkedJson<UserPayoutsResponse & UserApiPayload>(
    payoutsResponse,
    "Could not load payout history.",
  );

  return { session, policy, payouts };
}

export default function UserPayoutsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [policy, setPolicy] = useState<CurrentPayoutPolicyResponse | null>(null);
  const [payouts, setPayouts] = useState<UserPayoutsResponse | null>(null);
  const [sourceBucket, setSourceBucket] = useState<PayoutBucket>("MAIN");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const enabledBuckets = policy?.enabledBuckets ?? [];
  const requestsEnabled =
    Boolean(policy?.available) && Boolean(policy?.requestsEnabled);
  const activePolicy = policy?.policy ?? null;
  const sourceBucketEnabled = enabledBuckets.includes(sourceBucket);

  const payoutRows = useMemo<PayoutRequest[]>(
    () => payouts?.payouts ?? [],
    [payouts],
  );

  async function reload() {
    setLoading(true);
    setError(null);

    try {
      const workspace = await fetchPayoutWorkspace();
      setSession(workspace.session);
      setPolicy(workspace.policy);
      setPayouts(workspace.payouts);

      if (
        workspace.policy.enabledBuckets.length > 0 &&
        !workspace.policy.enabledBuckets.includes(sourceBucket)
      ) {
        setSourceBucket(workspace.policy.enabledBuckets[0]);
      }
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load payout workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const workspace = await fetchPayoutWorkspace();
        if (!mounted) return;

        setSession(workspace.session);
        setPolicy(workspace.policy);
        setPayouts(workspace.payouts);

        if (workspace.policy.enabledBuckets.length > 0) {
          setSourceBucket(workspace.policy.enabledBuckets[0]);
        }
      } catch (caught) {
        if (!mounted) return;

        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load payout workspace.",
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

  async function submitPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (!requestsEnabled || !activePolicy) {
        throw new Error("Payout requests are currently disabled.");
      }
      if (!sourceBucketEnabled) {
        throw new Error("Selected wallet bucket is not enabled for payouts.");
      }
      if (!amount.trim() || !destinationAddress.trim()) {
        throw new Error("Amount and destination address are required.");
      }

      const response = await fetch("/api/user/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          sourceBucket,
          amount: amount.trim(),
          destinationAddress: destinationAddress.trim(),
        }),
      });

      const payload = await checkedJson<
        ApiMessagePayload & { created: boolean; payout: PayoutRequest }
      >(response, "Payout request could not be created.");

      setAmount("");
      setDestinationAddress("");
      setSuccess(
        payload.created
          ? `Payout ${payload.payout.id} created and funds reserved.`
          : `Payout ${payload.payout.id} was already created.`,
      );

      await reload();
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Payout request could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

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

        {success ? (
          <FlashMessage
            message={success}
            type="success"
            onClose={() => setSuccess(null)}
          />
        ) : null}

        <section className={styles.hero}>
          <p className={styles.eyebrow}>PAYOUT-01 / WITHDRAWAL & PAYOUTS</p>
          <h1>Payouts</h1>
          <p>
            Request a payout from an enabled accounting bucket to the published
            network. Creating a request atomically reserves the requested wallet
            amount until an administrator rejects it or completes settlement.
          </p>
        </section>

        <section className={styles.warning}>
          FixTradeZone never asks for a private key, seed phrase, or signing
          secret. Only a public destination address is required. Network transfer
          completion is controlled separately by the payout operations workflow.
        </section>

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading payout workspace…</div>
          </section>
        ) : activePolicy ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Effective Policy</p>
                <h2>
                  {activePolicy.asset} / {activePolicy.networkCode}
                </h2>
              </div>
              <span
                className={styles.badge}
                data-tone={requestsEnabled ? "success" : "warning"}
              >
                {requestsEnabled ? "Requests enabled" : "Requests disabled"}
              </span>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <small>Minimum</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.minimumAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Maximum</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.maximumAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Fixed fee</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.fixedFeeAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Percentage fee</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.percentageFee)}%
                </strong>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.empty}>
              No published payout policy is effective. Payout requests are fail-closed.
            </div>
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>New Request</p>
              <h2>Request payout</h2>
            </div>
          </div>

          <form onSubmit={submitPayout} className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="payout-source-bucket">Source wallet bucket</label>
              <select
                id="payout-source-bucket"
                className={styles.select}
                value={sourceBucket}
                onChange={(event) =>
                  setSourceBucket(event.target.value as PayoutBucket)
                }
                disabled={busy || !requestsEnabled}
              >
                {enabledBuckets.length === 0 ? (
                  <option value="MAIN">No bucket enabled</option>
                ) : (
                  enabledBuckets.map((bucket) => (
                    <option value={bucket} key={bucket}>
                      {payoutBucketLabel(bucket)}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="payout-amount">Gross amount</label>
              <input
                id="payout-amount"
                className={styles.input}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="100"
                disabled={busy || !requestsEnabled}
              />
            </div>

            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="payout-address">Public destination address</label>
              <input
                id="payout-address"
                className={`${styles.input} ${styles.mono}`}
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
                placeholder={
                  activePolicy?.validationProfile === "TRON"
                    ? "TRON / TRC20 public address"
                    : "Public network address"
                }
                disabled={busy || !requestsEnabled}
                autoComplete="off"
              />
              <span className={styles.help}>
                Address validation follows the published network profile.
              </span>
            </div>

            <div className={styles.actions} style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                className={styles.button}
                disabled={
                  busy ||
                  !requestsEnabled ||
                  !sourceBucketEnabled ||
                  enabledBuckets.length === 0
                }
              >
                {busy ? "Submitting…" : "Reserve funds & request payout"}
              </button>
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable Workflow</p>
              <h2>My payout history</h2>
            </div>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void reload()}
              disabled={loading || busy}
            >
              Refresh
            </button>
          </div>

          {payoutRows.length === 0 ? (
            <div className={styles.empty}>No payout requests yet.</div>
          ) : (
            <div className={styles.list}>
              {payoutRows.map((payout) => {
                const tone = payoutStatusTone(payout.status);
                return (
                  <article className={styles.row} key={payout.id}>
                    <div className={styles.rowTop}>
                      <div>
                        <strong>
                          {compactPayoutDecimal(payout.grossAmount)} {payout.asset}
                        </strong>
                        <span className={styles.meta}>
                          {payoutBucketLabel(payout.sourceBucket)} · {payout.networkCode} · {formatPayoutDate(payout.createdAt)}
                        </span>
                      </div>
                      <span
                        className={styles.badge}
                        data-tone={tone === "neutral" ? undefined : tone}
                      >
                        {payout.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className={styles.metrics}>
                      <div className={styles.metric}>
                        <small>Fee</small>
                        <strong>
                          {compactPayoutDecimal(payout.feeAmount)} {payout.asset}
                        </strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Net payout</small>
                        <strong>
                          {compactPayoutDecimal(payout.netAmount)} {payout.asset}
                        </strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Reviewed</small>
                        <strong>{formatPayoutDate(payout.reviewedAt)}</strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Completed</small>
                        <strong>{formatPayoutDate(payout.completedAt)}</strong>
                      </div>
                    </div>

                    <p>
                      Destination: <span className={styles.mono}>{payout.destinationAddress}</span>
                    </p>
                    {payout.externalTxid ? (
                      <p>
                        External TXID: <span className={styles.mono}>{payout.externalTxid}</span>
                      </p>
                    ) : null}
                    {payout.reviewNote ? <p>Review note: {payout.reviewNote}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
