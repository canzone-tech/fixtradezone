"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/payouts/payout.module.css";
import {
  PAYOUT_BUCKETS,
  type AdminPayoutRequest,
  type AdminPayoutsResponse,
  type ApiMessagePayload,
  type PayoutBucket,
  type PayoutPoliciesResponse,
  type PayoutPolicy,
  type PayoutValidationProfile,
  compactPayoutDecimal,
  formatPayoutDate,
  messageFrom,
  payoutBucketLabel,
  payoutStatusTone,
  readJson,
} from "@/lib/payouts";

class AdminPayoutAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminPayoutAccessError";
  }
}

async function checkedAdminJson<T extends ApiMessagePayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);

  if (response.status === 401 || response.status === 403) {
    throw new AdminPayoutAccessError(
      messageFrom(payload, fallback),
      response.status,
    );
  }

  if (!response.ok || !payload) {
    throw new Error(messageFrom(payload, fallback));
  }

  return payload;
}

async function fetchWorkspace(): Promise<{
  payouts: AdminPayoutsResponse;
  policies: PayoutPoliciesResponse;
}> {
  const [payoutsResponse, policiesResponse] = await Promise.all([
    fetch("/api/admin/payouts?limit=100", { cache: "no-store" }),
    fetch("/api/admin/payout-policies?limit=50", { cache: "no-store" }),
  ]);

  const payouts = await checkedAdminJson<
    AdminPayoutsResponse & ApiMessagePayload
  >(payoutsResponse, "Could not load payout requests.");
  const policies = await checkedAdminJson<
    PayoutPoliciesResponse & ApiMessagePayload
  >(policiesResponse, "Could not load payout policies.");

  return { payouts, policies };
}

export default function PayoutsClient() {
  const router = useRouter();
  const [payouts, setPayouts] = useState<AdminPayoutsResponse | null>(null);
  const [policies, setPolicies] = useState<PayoutPoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const draft = useMemo(
    () => policies?.policies.find((policy) => policy.status === "DRAFT") ?? null,
    [policies],
  );

  const [requestsEnabled, setRequestsEnabled] = useState(false);
  const [asset, setAsset] = useState("USDT");
  const [networkCode, setNetworkCode] = useState("TRC20");
  const [validationProfile, setValidationProfile] =
    useState<PayoutValidationProfile>("TRON");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [maximumAmount, setMaximumAmount] = useState("");
  const [fixedFeeAmount, setFixedFeeAmount] = useState("0");
  const [percentageFee, setPercentageFee] = useState("0");
  const [enabledBuckets, setEnabledBuckets] = useState<PayoutBucket[]>([]);

  useEffect(() => {
    if (!draft) return;

    setRequestsEnabled(draft.requestsEnabled);
    setAsset(draft.asset);
    setNetworkCode(draft.networkCode);
    setValidationProfile(draft.validationProfile);
    setMinimumAmount(draft.minimumAmount ?? "");
    setMaximumAmount(draft.maximumAmount ?? "");
    setFixedFeeAmount(draft.fixedFeeAmount);
    setPercentageFee(draft.percentageFee);
    setEnabledBuckets(draft.enabledBuckets ?? []);
  }, [draft]);

  async function reload() {
    setLoading(true);
    setError(null);

    try {
      const workspace = await fetchWorkspace();
      setPayouts(workspace.payouts);
      setPolicies(workspace.policies);
    } catch (caught) {
      if (caught instanceof AdminPayoutAccessError && caught.status === 401) {
        router.replace("/login");
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
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleBucket(bucket: PayoutBucket) {
    setEnabledBuckets((current) =>
      current.includes(bucket)
        ? current.filter((item) => item !== bucket)
        : [...current, bucket],
    );
  }

  async function runMutation(
    path: string,
    init: RequestInit,
    fallback: string,
    successMessage: string,
  ) {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(path, init);
      await checkedAdminJson<ApiMessagePayload & Record<string, unknown>>(
        response,
        fallback,
      );
      setSuccess(successMessage);
      await reload();
    } catch (caught) {
      if (caught instanceof AdminPayoutAccessError && caught.status === 401) {
        router.replace("/login");
        return;
      }
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    await runMutation(
      "/api/admin/payout-policies",
      { method: "POST" },
      "Could not create payout policy draft.",
      "Fail-closed payout policy draft created.",
    );
  }

  async function saveDraft() {
    if (!draft) return;

    await runMutation(
      `/api/admin/payout-policies/${encodeURIComponent(draft.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: draft.revision,
          requestsEnabled,
          asset: asset.trim(),
          networkCode: networkCode.trim(),
          validationProfile,
          minimumAmount: minimumAmount.trim() || null,
          maximumAmount: maximumAmount.trim() || null,
          fixedFeeAmount: fixedFeeAmount.trim(),
          percentageFee: percentageFee.trim(),
          enabledBuckets,
        }),
      },
      "Could not save payout policy draft.",
      "Payout policy draft saved.",
    );
  }

  async function publishDraft() {
    if (!draft) return;

    const reason = window.prompt(
      "Optional publication reason / change note:",
      "PAYOUT-01 policy publication",
    );

    if (reason === null) return;

    await runMutation(
      `/api/admin/payout-policies/${encodeURIComponent(draft.id)}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: draft.revision,
          reason: reason.trim() || undefined,
        }),
      },
      "Could not publish payout policy.",
      "Payout policy published.",
    );
  }

  async function approve(payout: AdminPayoutRequest) {
    const note = window.prompt("Optional approval note:", "Approved for payout");
    if (note === null) return;

    await runMutation(
      `/api/admin/payouts/${encodeURIComponent(payout.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      },
      "Could not approve payout.",
      `Payout ${payout.id} approved.`,
    );
  }

  async function reject(payout: AdminPayoutRequest) {
    const note = window.prompt(
      "Rejection note (reserved funds will be released):",
      "Rejected by payout operations",
    );
    if (note === null) return;

    await runMutation(
      `/api/admin/payouts/${encodeURIComponent(payout.id)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      },
      "Could not reject payout.",
      `Payout ${payout.id} rejected and reserve released.`,
    );
  }

  async function submitTxid(payout: AdminPayoutRequest) {
    const txid = window.prompt(
      `Enter external ${payout.networkCode} transaction ID. This records a public reference only:`,
    );
    if (txid === null || !txid.trim()) return;

    await runMutation(
      `/api/admin/payouts/${encodeURIComponent(payout.id)}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: txid.trim() }),
      },
      "Could not record payout transaction ID.",
      `External TXID recorded for payout ${payout.id}.`,
    );
  }

  async function complete(payout: AdminPayoutRequest) {
    const confirmed = window.confirm(
      `Mark payout ${payout.id} COMPLETED and settle its reserved accounting value?\n\nThis does not perform blockchain signing. Confirm only after payout operations has independently completed the external transfer.`,
    );
    if (!confirmed) return;

    await runMutation(
      `/api/admin/payouts/${encodeURIComponent(payout.id)}/complete`,
      { method: "POST" },
      "Could not complete payout.",
      `Payout ${payout.id} completed and reserve settled.`,
    );
  }

  const payoutRows = payouts?.payouts ?? [];

  return (
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
        <p className={styles.eyebrow}>PAYOUT-01 / OPERATIONS</p>
        <h1>Withdrawal & Payouts</h1>
        <p>
          Configure versioned payout policy, review reserve-backed requests,
          record the public external transaction reference, and settle accounting
          only after manual payout operations confirms completion.
        </p>
      </section>

      <section className={styles.warning}>
        FixTradeZone does not store private keys or seed phrases and this console
        does not sign blockchain transactions. “Complete” is an administrator
        confirmation after the external transfer has been performed separately.
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Versioned Configuration</p>
            <h2>Payout policy</h2>
          </div>
          <div className={styles.actions}>
            {!draft ? (
              <button
                type="button"
                className={styles.button}
                onClick={() => void createDraft()}
                disabled={busy}
              >
                Create draft
              </button>
            ) : null}
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void reload()}
              disabled={loading || busy}
            >
              Refresh
            </button>
          </div>
        </div>

        {draft ? (
          <div className={styles.list}>
            <div className={styles.row}>
              <div className={styles.rowTop}>
                <div>
                  <strong>Draft v{draft.versionNumber}</strong>
                  <span className={styles.meta}>
                    Revision {draft.revision} · fail-closed until published
                  </span>
                </div>
                <span className={styles.badge} data-tone="warning">
                  DRAFT
                </span>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="payout-asset">Asset</label>
                  <input
                    id="payout-asset"
                    className={styles.input}
                    value={asset}
                    onChange={(event) => setAsset(event.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="payout-network">Network code</label>
                  <input
                    id="payout-network"
                    className={styles.input}
                    value={networkCode}
                    onChange={(event) => setNetworkCode(event.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="payout-profile">Validation profile</label>
                  <select
                    id="payout-profile"
                    className={styles.select}
                    value={validationProfile}
                    onChange={(event) =>
                      setValidationProfile(
                        event.target.value as PayoutValidationProfile,
                      )
                    }
                    disabled={busy}
                  >
                    <option value="TRON">TRON</option>
                    <option value="EVM">EVM</option>
                    <option value="SOLANA">SOLANA</option>
                  </select>
                </div>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={requestsEnabled}
                    onChange={(event) => setRequestsEnabled(event.target.checked)}
                    disabled={busy}
                  />
                  Enable USER payout requests
                </label>

                <div className={styles.field}>
                  <label htmlFor="payout-minimum">Minimum amount</label>
                  <input
                    id="payout-minimum"
                    className={styles.input}
                    inputMode="decimal"
                    value={minimumAmount}
                    onChange={(event) => setMinimumAmount(event.target.value)}
                    placeholder="Optional"
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="payout-maximum">Maximum amount</label>
                  <input
                    id="payout-maximum"
                    className={styles.input}
                    inputMode="decimal"
                    value={maximumAmount}
                    onChange={(event) => setMaximumAmount(event.target.value)}
                    placeholder="Optional"
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="payout-fixed-fee">Fixed fee</label>
                  <input
                    id="payout-fixed-fee"
                    className={styles.input}
                    inputMode="decimal"
                    value={fixedFeeAmount}
                    onChange={(event) => setFixedFeeAmount(event.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="payout-percent-fee">Percentage fee</label>
                  <input
                    id="payout-percent-fee"
                    className={styles.input}
                    inputMode="decimal"
                    value={percentageFee}
                    onChange={(event) => setPercentageFee(event.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <p className={styles.muted}>Enabled source buckets</p>
                <div className={styles.checkboxGrid}>
                  {PAYOUT_BUCKETS.map((bucket) => (
                    <label className={styles.checkboxLabel} key={bucket}>
                      <input
                        type="checkbox"
                        checked={enabledBuckets.includes(bucket)}
                        onChange={() => toggleBucket(bucket)}
                        disabled={busy}
                      />
                      {payoutBucketLabel(bucket)}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => void saveDraft()}
                  disabled={busy}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => void publishDraft()}
                  disabled={busy}
                >
                  Publish policy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.notice}>
            No editable draft exists. Published policies remain immutable; create
            a new version to change payout terms.
          </div>
        )}

        {policies && policies.policies.length > 0 ? (
          <div className={styles.tableWrap} style={{ marginTop: 18 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Asset / Network</th>
                  <th>Requests</th>
                  <th>Buckets</th>
                  <th>Fees</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {policies.policies.map((policy: PayoutPolicy) => (
                  <tr key={policy.id}>
                    <td>v{policy.versionNumber} / r{policy.revision}</td>
                    <td>{policy.status}</td>
                    <td>{policy.asset} / {policy.networkCode}</td>
                    <td>{policy.requestsEnabled ? "Enabled" : "Disabled"}</td>
                    <td>
                      {(policy.enabledBuckets ?? [])
                        .map(payoutBucketLabel)
                        .join(", ") || "None"}
                    </td>
                    <td>
                      {compactPayoutDecimal(policy.fixedFeeAmount)} + {compactPayoutDecimal(policy.percentageFee)}%
                    </td>
                    <td>{formatPayoutDate(policy.effectiveFrom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Reserve-backed Queue</p>
            <h2>Payout requests</h2>
          </div>
          <span className={styles.badge}>{payouts?.total ?? 0} total</span>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading payout requests…</div>
        ) : payoutRows.length === 0 ? (
          <div className={styles.empty}>No payout requests found.</div>
        ) : (
          <div className={styles.list}>
            {payoutRows.map((payout) => {
              const tone = payoutStatusTone(payout.status);
              return (
                <article className={styles.row} key={payout.id}>
                  <div className={styles.rowTop}>
                    <div>
                      <strong>
                        {compactPayoutDecimal(payout.grossAmount)} {payout.asset} · {payout.username}
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
                      <small>Gross</small>
                      <strong>{compactPayoutDecimal(payout.grossAmount)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Fee</small>
                      <strong>{compactPayoutDecimal(payout.feeAmount)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <small>Net</small>
                      <strong>{compactPayoutDecimal(payout.netAmount)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <small>User</small>
                      <strong>{payout.email || payout.username}</strong>
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

                  <div className={styles.actions}>
                    {payout.status === "PENDING_REVIEW" ? (
                      <>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => void approve(payout)}
                          disabled={busy}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => void reject(payout)}
                          disabled={busy}
                        >
                          Reject & release
                        </button>
                      </>
                    ) : null}

                    {payout.status === "APPROVED" ? (
                      <>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => void submitTxid(payout)}
                          disabled={busy}
                        >
                          Record external TXID
                        </button>
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => void reject(payout)}
                          disabled={busy}
                        >
                          Reject & release
                        </button>
                      </>
                    ) : null}

                    {payout.status === "SUBMITTED" ? (
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => void complete(payout)}
                        disabled={busy}
                      >
                        Confirm complete & settle
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
