"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/components/deposits/deposits.module.css";
import {
  type ApiMessagePayload,
  type Deposit,
  type DepositMutationResponse,
  type DepositsResponse,
  compactDecimal,
  messageFrom,
  readJson,
  statusLabel,
  statusTone,
} from "@/lib/deposits";
import type { PackageCatalogue, PackagePlanItem } from "@/lib/packages";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UserDepositsClient() {
  const [packages, setPackages] = useState<PackagePlanItem[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [txid, setTxid] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openDeposit = useMemo(
    () =>
      deposits.find(
        (deposit) =>
          deposit.status === "AWAITING_TXID" ||
          deposit.status === "PENDING_REVIEW",
      ) ?? null,
    [deposits],
  );

  const availablePackages = useMemo(
    () => packages.filter((item) => item.availability === "AVAILABLE"),
    [packages],
  );

  const selectedPackage = useMemo(
    () =>
      availablePackages.find((item) => item.id === selectedPackageId) ?? null,
    [availablePackages, selectedPackageId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [packageResponse, depositResponse] = await Promise.all([
        fetch("/api/user/packages", { cache: "no-store" }),
        fetch("/api/user/deposits", { cache: "no-store" }),
      ]);

      const packagePayload = await readJson<PackageCatalogue & ApiMessagePayload>(
        packageResponse,
      );
      const depositPayload = await readJson<DepositsResponse & ApiMessagePayload>(
        depositResponse,
      );

      if (!packageResponse.ok || !packagePayload) {
        throw new Error(
          messageFrom(packagePayload, "Could not load available packages."),
        );
      }

      if (!depositResponse.ok || !depositPayload) {
        throw new Error(
          messageFrom(depositPayload, "Could not load deposit history."),
        );
      }

      const available = packagePayload.catalogueAvailable
        ? packagePayload.items.filter((item) => item.availability === "AVAILABLE")
        : [];

      setPackages(available);
      setDeposits(depositPayload.deposits);
      setSelectedPackageId((current) =>
        available.some((item) => item.id === current)
          ? current
          : (available[0]?.id ?? ""),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load deposit workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDeposit() {
    if (!selectedPackageId || openDeposit) return;

    setBusy("create");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/user/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packagePlanItemId: selectedPackageId }),
      });
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );

      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not create deposit request."));
      }

      setNotice(payload.message);
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create deposit request.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitTxid(deposit: Deposit) {
    const normalized = txid.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
      setError("TXID must be exactly 64 hexadecimal characters.");
      return;
    }

    setBusy(`txid-${deposit.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/user/deposits/${deposit.id}/txid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: normalized }),
      });
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );

      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not submit TXID."));
      }

      setTxid("");
      setNotice(payload.message);
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit TXID.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Receiving address copied.");
    } catch {
      setError("Could not copy the receiving address.");
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>USDT / TRC20</p>
          <h1>Deposits</h1>
          <p>
            Create a package payment request, send the exact USDT amount to the
            server-assigned TRC20 address, then submit the transaction ID for
            manual review. An approved payment does not become wallet balance or
            an active package until the later accounting/activation milestone.
          </p>
        </div>
        {openDeposit ? (
          <span
            className={styles.badge}
            data-tone={statusTone(openDeposit.status)}
          >
            {statusLabel(openDeposit.status)}
          </span>
        ) : null}
      </section>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.card}>
          <div className={styles.empty}>Loading deposit workspace…</div>
        </div>
      ) : openDeposit ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Open Deposit</p>
              <h2>{openDeposit.packageDisplayName}</h2>
            </div>
            <span
              className={styles.badge}
              data-tone={statusTone(openDeposit.status)}
            >
              {statusLabel(openDeposit.status)}
            </span>
          </div>

          <div className={styles.qrWrap}>
            {/* Stored account QR is an operator-controlled data URL snapshot. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.qr}
              src={openDeposit.assignedQrCodeDataUrl}
              alt={`USDT TRC20 QR for ${openDeposit.assignedAccountLabel}`}
            />
            <div className={styles.list}>
              <div className={styles.kv}>
                <div>
                  <small>Exact amount</small>
                  <strong>
                    {compactDecimal(openDeposit.amount)} {openDeposit.currency}
                  </strong>
                </div>
                <div>
                  <small>Network</small>
                  <strong>{openDeposit.assignedNetwork}</strong>
                </div>
                <div className={styles.full}>
                  <small>Assigned receiving address</small>
                  <strong className={styles.mono}>
                    {openDeposit.assignedWalletAddress}
                  </strong>
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => void copyAddress(openDeposit.assignedWalletAddress)}
                >
                  Copy address
                </button>
              </div>
            </div>
          </div>

          {openDeposit.status === "AWAITING_TXID" ? (
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="deposit-txid">TRON transaction ID (TXID)</label>
                <input
                  className={styles.input}
                  id="deposit-txid"
                  value={txid}
                  onChange={(event) => setTxid(event.target.value)}
                  placeholder="64 hexadecimal characters"
                  maxLength={64}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <div className={`${styles.actions} ${styles.full}`}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void submitTxid(openDeposit)}
                >
                  {busy === `txid-${openDeposit.id}`
                    ? "Submitting…"
                    : "Submit TXID for review"}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.notice}>
              TXID <span className={styles.mono}>{openDeposit.txid}</span> was
              submitted {formatDate(openDeposit.submittedAt)}. Manual review is
              pending; do not send another payment for this request.
            </div>
          )}
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>New Deposit</p>
              <h2>Select package</h2>
            </div>
          </div>

          {availablePackages.length === 0 ? (
            <div className={styles.empty}>
              No currently available package can create a deposit request.
            </div>
          ) : (
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="deposit-package">Package</label>
                <select
                  className={styles.select}
                  id="deposit-package"
                  value={selectedPackageId}
                  onChange={(event) => setSelectedPackageId(event.target.value)}
                >
                  {availablePackages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName} — {compactDecimal(item.price)} {item.currency}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPackage ? (
                <div className={`${styles.notice} ${styles.full}`}>
                  The backend will use the published price of{" ""}
                  <strong>{compactDecimal(selectedPackage.price)} USDT</strong>{" ""}
                  and randomly assign an active TRC20 receiving account. You
                  cannot choose or override the payment address.
                </div>
              ) : null}

              <div className={`${styles.actions} ${styles.full}`}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={!selectedPackageId || busy !== null}
                  onClick={() => void createDeposit()}
                >
                  {busy === "create" ? "Creating…" : "Create deposit request"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>History</p>
            <h2>My deposits</h2>
          </div>
          <button
            className={styles.buttonSecondary}
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        {deposits.length === 0 ? (
          <div className={styles.empty}>No deposit requests yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>TXID</th>
                  <th>Created</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((deposit) => (
                  <tr key={deposit.id}>
                    <td>{deposit.packageDisplayName}</td>
                    <td>
                      {compactDecimal(deposit.amount)} {deposit.currency}
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        data-tone={statusTone(deposit.status)}
                      >
                        {statusLabel(deposit.status)}
                      </span>
                    </td>
                    <td className={styles.mono}>{deposit.txid ?? "—"}</td>
                    <td>{formatDate(deposit.createdAt)}</td>
                    <td>{deposit.reviewNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
