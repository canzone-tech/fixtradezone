"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/components/deposits/deposits.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";
import {
  type ApiMessagePayload,
  type DepositPaymentRailsResponse,
  messageFrom,
  readJson,
} from "@/lib/deposits";

type DepositApprovalMode = "MANUAL" | "AUTO_AFTER_BLOCKCHAIN_VERIFIED";

interface ApprovalModeResponse extends ApiMessagePayload {
  rail: {
    id: string;
    asset: string;
    networkCode: string;
    displayName: string;
    validationProfile: string;
    isActive: boolean;
  };
  approvalPolicy: {
    approvalMode: DepositApprovalMode;
    automaticApprovalEnabled: boolean;
    revision: number;
    updatedByUserId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    blockchainVerificationMode: "OFF" | "VERIFY_ONLY";
    automaticApprovalEligible: boolean;
  };
}

export default function DepositApprovalModePanel() {
  const [items, setItems] = useState<ApprovalModeResponse[]>([]);
  const [selectedModes, setSelectedModes] = useState<
    Record<string, DepositApprovalMode>
  >({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const session = await resolveAdminSession();
      const isSuperAdmin = session.user?.roles.includes("SUPER_ADMIN") ?? false;
      setVisible(isSuperAdmin);
      if (!isSuperAdmin) {
        setItems([]);
        return;
      }

      const railsResponse = await fetch("/api/admin/deposit-payment-rails", {
        cache: "no-store",
      });
      const railsPayload = await readJson<
        DepositPaymentRailsResponse & ApiMessagePayload
      >(railsResponse);
      if (!railsResponse.ok || !railsPayload) {
        throw new Error(messageFrom(railsPayload, "Could not load payment rails."));
      }

      const activeRails = railsPayload.rails.filter((rail) => rail.isActive);
      const loaded = await Promise.all(
        activeRails.map(async (rail) => {
          const response = await fetch(
            `/api/admin/deposit-payment-rails/${encodeURIComponent(rail.id)}/approval-mode`,
            { cache: "no-store" },
          );
          const payload = await readJson<ApprovalModeResponse>(response);
          if (!response.ok || !payload) {
            throw new Error(
              messageFrom(payload, `Could not load approval mode for ${rail.displayName}.`),
            );
          }
          return payload;
        }),
      );

      setItems(loaded);
      setSelectedModes(
        Object.fromEntries(
          loaded.map((item) => [item.rail.id, item.approvalPolicy.approvalMode]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load deposit approval modes.",
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

  async function save(item: ApprovalModeResponse) {
    const approvalMode =
      selectedModes[item.rail.id] ?? item.approvalPolicy.approvalMode;
    const reason = (reasons[item.rail.id] ?? "").trim();

    if (reason.length < 3) {
      setError("An audit reason of at least 3 characters is required.");
      return;
    }
    if (
      approvalMode === "AUTO_AFTER_BLOCKCHAIN_VERIFIED" &&
      !item.approvalPolicy.automaticApprovalEligible
    ) {
      setError(
        "Automatic approval requires an enabled and complete BSC VERIFY_ONLY configuration for this rail.",
      );
      return;
    }
    if (
      approvalMode === "AUTO_AFTER_BLOCKCHAIN_VERIFIED" &&
      item.approvalPolicy.approvalMode !== approvalMode
    ) {
      const confirmed = window.confirm(
        "Enable automatic deposit approval for this rail? Only blockchain VERIFIED deposits will be approved automatically. Manual SUPER_ADMIN approval will be disabled while this mode is active.",
      );
      if (!confirmed) return;
    }

    setBusyId(item.rail.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/deposit-payment-rails/${encodeURIComponent(item.rail.id)}/approval-mode`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalMode, reason }),
        },
      );
      const payload = await readJson<ApprovalModeResponse>(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not update deposit approval mode."),
        );
      }

      setReasons((current) => ({ ...current, [item.rail.id]: "" }));
      setNotice(
        approvalMode === "MANUAL"
          ? "Manual deposit approval mode is active."
          : "Automatic blockchain-verified deposit approval mode is active.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update deposit approval mode.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!visible && !loading) return null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>DEP-03 / APPROVAL POLICY</p>
          <h2>Deposit approval mode</h2>
          <p className={styles.muted}>
            SUPER_ADMIN chooses one mutually exclusive policy per active payment
            rail. MANUAL keeps the final decision with SUPER_ADMIN. AUTO approves
            only after blockchain verification reaches VERIFIED.
          </p>
        </div>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Refreshing…" : "Refresh modes"}
        </button>
      </div>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading && items.length === 0 ? (
        <div className={styles.notice}>Loading deposit approval policy…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>No active payment rails are configured.</div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const selected =
              selectedModes[item.rail.id] ?? item.approvalPolicy.approvalMode;
            const automatic =
              item.approvalPolicy.approvalMode ===
              "AUTO_AFTER_BLOCKCHAIN_VERIFIED";

            return (
              <div className={styles.row} key={item.rail.id}>
                <div className={styles.rowTop}>
                  <div className={styles.rowTitle}>
                    <strong>{item.rail.displayName}</strong>
                    <small>
                      {item.rail.asset} · {item.rail.networkCode} · blockchain {" "}
                      {item.approvalPolicy.blockchainVerificationMode}
                    </small>
                  </div>
                  <span
                    className={styles.badge}
                    data-tone={automatic ? "warning" : "info"}
                  >
                    {automatic ? "BSC AUTO" : "MANUAL"}
                  </span>
                </div>

                <div className={styles.notice}>
                  {automatic ? (
                    <>
                      <strong>AUTO AFTER BLOCKCHAIN VERIFIED</strong>
                      <p>
                        Open deposits are re-checked automatically. Only VERIFIED
                        evidence may enter the existing approval/accounting/package
                        lifecycle. Manual approval is disabled in this mode.
                      </p>
                    </>
                  ) : (
                    <>
                      <strong>MANUAL SUPER_ADMIN APPROVAL</strong>
                      <p>
                        Blockchain evidence remains visible, but SUPER_ADMIN owns
                        the final approve/reject decision. Use this as the controlled
                        fallback while automatic approval is not operationally
                        accepted.
                      </p>
                    </>
                  )}
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label htmlFor={`approval-mode-${item.rail.id}`}>
                      Approval mode
                    </label>
                    <select
                      className={styles.select}
                      id={`approval-mode-${item.rail.id}`}
                      value={selected}
                      onChange={(event) =>
                        setSelectedModes((current) => ({
                          ...current,
                          [item.rail.id]: event.target.value as DepositApprovalMode,
                        }))
                      }
                    >
                      <option value="MANUAL">MANUAL</option>
                      <option
                        value="AUTO_AFTER_BLOCKCHAIN_VERIFIED"
                        disabled={!item.approvalPolicy.automaticApprovalEligible}
                      >
                        AUTO AFTER BLOCKCHAIN VERIFIED
                      </option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`approval-reason-${item.rail.id}`}>
                      Audit reason
                    </label>
                    <input
                      className={styles.input}
                      id={`approval-reason-${item.rail.id}`}
                      value={reasons[item.rail.id] ?? ""}
                      minLength={3}
                      maxLength={500}
                      placeholder="Why is this approval mode changing?"
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [item.rail.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void save(item)}
                  >
                    {busyId === item.rail.id ? "Saving…" : "Save approval mode"}
                  </button>
                  <span className={styles.muted}>
                    Revision {item.approvalPolicy.revision}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
