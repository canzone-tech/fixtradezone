"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/components/deposits/deposits.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";
import {
  type ApiMessagePayload,
  type Deposit,
  type DepositsResponse,
  messageFrom,
  readJson,
  statusLabel,
} from "@/lib/deposits";
import { formatPlatformDateTime } from "@/lib/platform-time";

type BlockchainVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "FAILED"
  | "UNAVAILABLE";

type DepositApprovalMode = "MANUAL" | "AUTO_AFTER_BLOCKCHAIN_VERIFIED";

interface BlockchainVerificationRecord {
  depositId: string;
  status: BlockchainVerificationStatus;
  provider: string;
  chainId: number | null;
  tokenContractAddress: string | null;
  tokenDecimals: number | null;
  requiredConfirmations: number | null;
  observedConfirmations: number | null;
  blockNumber: string | null;
  onChainAmount: string | null;
  receivingAddress: string | null;
  txid: string | null;
  failureCode: string | null;
  failureReason: string | null;
  attemptCount: number;
  checkedAt: string;
  verifiedAt: string | null;
}

interface ApprovalPolicy {
  approvalMode: DepositApprovalMode;
  verificationMode: "OFF" | "VERIFY_ONLY";
  verificationStatus: BlockchainVerificationStatus | null;
}

interface BlockchainVerificationResponse extends ApiMessagePayload {
  depositId: string;
  required: boolean;
  paymentRailId: string;
  network: string;
  verification: BlockchainVerificationRecord | null;
  approvalPolicy: ApprovalPolicy;
}

interface BlockchainVerificationActionResponse extends ApiMessagePayload {
  alreadyVerified: boolean;
  verification: BlockchainVerificationRecord;
  approvalPolicy?: {
    approvalMode: DepositApprovalMode;
    automaticApprovalEnabled: boolean;
  };
  autoApproval?: {
    attempted: boolean;
    approved: boolean;
    message?: string;
  };
}

interface QueueItem {
  deposit: Deposit;
  verification: BlockchainVerificationResponse | null;
  verificationError: string | null;
}

function hasPermission(
  roles: string[],
  permissions: string[],
  permission: string,
): boolean {
  return roles.includes("SUPER_ADMIN") || permissions.includes(permission);
}

function verificationLabel(item: QueueItem): string {
  if (item.verificationError) return "CHECK FAILED";
  if (!item.verification) return "NOT CHECKED";
  if (!item.verification.required) return "NOT REQUIRED";

  switch (item.verification.verification?.status) {
    case "VERIFIED":
      return "BLOCKCHAIN VERIFIED";
    case "PENDING":
      return "PENDING CONFIRMATIONS";
    case "FAILED":
      return "VERIFICATION FAILED";
    case "UNAVAILABLE":
      return "RPC UNAVAILABLE";
    default:
      return "NOT CHECKED";
  }
}

function verificationTone(item: QueueItem): string {
  if (item.verificationError) return "danger";
  if (!item.verification?.required) return "info";

  switch (item.verification.verification?.status) {
    case "VERIFIED":
      return "success";
    case "FAILED":
      return "danger";
    case "PENDING":
    case "UNAVAILABLE":
      return "warning";
    default:
      return "info";
  }
}

function approvalModeLabel(item: QueueItem): string {
  return item.verification?.approvalPolicy.approvalMode ===
    "AUTO_AFTER_BLOCKCHAIN_VERIFIED"
    ? "BSC AUTO"
    : "MANUAL";
}

export default function DepositBlockchainVerificationPanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [canRead, setCanRead] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const session = await resolveAdminSession();
      if (!session.user) {
        throw new Error(session.message ?? "Administrator session is unavailable.");
      }

      const readable = hasPermission(
        session.user.roles,
        session.user.permissions,
        "deposits.read",
      );
      const reviewable = hasPermission(
        session.user.roles,
        session.user.permissions,
        "deposits.review",
      );
      setCanRead(readable);
      setCanReview(reviewable);

      if (!readable) {
        setItems([]);
        return;
      }

      const [pendingResponse, readyResponse] = await Promise.all([
        fetch("/api/admin/deposits?status=PENDING_REVIEW", {
          cache: "no-store",
        }),
        fetch("/api/admin/deposits?status=READY_FOR_APPROVAL", {
          cache: "no-store",
        }),
      ]);

      const [pendingPayload, readyPayload] = await Promise.all([
        readJson<DepositsResponse & ApiMessagePayload>(pendingResponse),
        readJson<DepositsResponse & ApiMessagePayload>(readyResponse),
      ]);

      if (!pendingResponse.ok || !pendingPayload) {
        throw new Error(
          messageFrom(pendingPayload, "Could not load pending deposits."),
        );
      }
      if (!readyResponse.ok || !readyPayload) {
        throw new Error(
          messageFrom(readyPayload, "Could not load ready deposits."),
        );
      }

      const deposits = [...pendingPayload.deposits, ...readyPayload.deposits];
      const uniqueDeposits = deposits.filter(
        (deposit, index, all) =>
          all.findIndex((candidate) => candidate.id === deposit.id) === index,
      );

      const loadedItems = await Promise.all(
        uniqueDeposits.map(async (deposit): Promise<QueueItem> => {
          const response = await fetch(
            `/api/admin/deposits/${encodeURIComponent(deposit.id)}/blockchain-verification`,
            { cache: "no-store" },
          );
          const payload = await readJson<BlockchainVerificationResponse>(response);

          if (!response.ok || !payload) {
            return {
              deposit,
              verification: null,
              verificationError: messageFrom(
                payload,
                "Blockchain verification state could not be loaded.",
              ),
            };
          }

          return {
            deposit,
            verification: payload,
            verificationError: null,
          };
        }),
      );

      setItems(loadedItems);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load blockchain verification gate.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function verify(item: QueueItem) {
    setBusyId(item.deposit.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/deposits/${encodeURIComponent(item.deposit.id)}/verify-blockchain`,
        { method: "POST" },
      );
      const payload = await readJson<BlockchainVerificationActionResponse>(
        response,
      );

      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Blockchain verification could not be completed."),
        );
      }

      setNotice(messageFrom(payload, "Blockchain verification completed."));
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Blockchain verification could not be completed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead && !loading) return null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>DEP-03 / SECURITY EVIDENCE</p>
          <h2>Blockchain verification</h2>
          <p className={styles.muted}>
            Blockchain evidence is always shown for configured rails. MANUAL keeps
            the final decision with SUPER_ADMIN; BSC AUTO waits for VERIFIED and
            then uses the existing approval/accounting lifecycle automatically.
          </p>
        </div>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Refreshing…" : "Refresh verification"}
        </button>
      </div>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading && items.length === 0 ? (
        <div className={styles.notice}>Loading open-deposit verification state…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          No pending or ready-for-approval deposits require review.
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const verification = item.verification?.verification ?? null;
            const approvalMode =
              item.verification?.approvalPolicy.approvalMode ?? "MANUAL";
            const verified = verification?.status === "VERIFIED";
            const actionLabel = verification
              ? verified
                ? "Verified"
                : "Retry blockchain verification"
              : "Verify blockchain";

            return (
              <div className={styles.row} key={item.deposit.id}>
                <div className={styles.rowTop}>
                  <div className={styles.rowTitle}>
                    <strong>
                      {item.deposit.packageDisplayName} · {item.deposit.amount}{" "}
                      {item.deposit.currency}
                    </strong>
                    <small>
                      {item.deposit.user?.username ?? item.deposit.userId} ·{" "}
                      {statusLabel(item.deposit.status)} · {approvalModeLabel(item)}
                    </small>
                  </div>
                  <span
                    className={styles.badge}
                    data-tone={verificationTone(item)}
                  >
                    {verificationLabel(item)}
                  </span>
                </div>

                <div className={styles.kv}>
                  <div>
                    <small>Approval mode</small>
                    <strong>{approvalModeLabel(item)}</strong>
                  </div>
                  <div>
                    <small>Network</small>
                    <strong>{item.deposit.assignedNetwork}</strong>
                  </div>
                  <div>
                    <small>Confirmations</small>
                    <strong>
                      {verification?.observedConfirmations ?? "—"} /{" "}
                      {verification?.requiredConfirmations ?? "—"}
                    </strong>
                  </div>
                  <div>
                    <small>On-chain amount</small>
                    <strong>
                      {verification?.onChainAmount
                        ? `${verification.onChainAmount} ${item.deposit.currency}`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <small>Last checked</small>
                    <strong>
                      {verification?.checkedAt
                        ? formatPlatformDateTime(verification.checkedAt)
                        : "Not checked"}
                    </strong>
                  </div>
                </div>

                {verification?.failureReason ? (
                  <div className={styles.notice}>
                    <strong>{verification.failureCode ?? verification.status}</strong>
                    <p>{verification.failureReason}</p>
                  </div>
                ) : item.verificationError ? (
                  <div className={styles.notice}>{item.verificationError}</div>
                ) : null}

                {canReview && item.verification?.required ? (
                  <div className={styles.actions}>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={busyId !== null || verified}
                      onClick={() => void verify(item)}
                    >
                      {busyId === item.deposit.id ? "Verifying…" : actionLabel}
                    </button>
                    <span className={styles.muted}>
                      {approvalMode === "AUTO_AFTER_BLOCKCHAIN_VERIFIED"
                        ? verified
                          ? "BSC AUTO may now process approval through the existing lifecycle."
                          : "Automatic approval waits until this state is VERIFIED."
                        : "MANUAL mode is active; SUPER_ADMIN owns the final approve/reject decision after reviewing this evidence."}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
