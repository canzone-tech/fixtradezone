"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import type { AdminUser } from "@/lib/auth";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "../platform-configuration.module.css";

type DepositPostingMode =
  | "AUTO_ON_APPROVAL"
  | "MANUAL_RECONCILIATION";

interface AccountingConfiguration {
  depositPostingMode: DepositPostingMode;
  updatedAt: string | null;
  message?: string;
}

interface ApiError {
  message?: string | string[];
}

function apiErrorMessage(payload: ApiError, fallback: string): string {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

export default function AccountingConfigurationClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] =
    useState<DepositPostingMode>("AUTO_ON_APPROVAL");
  const [mode, setMode] =
    useState<DepositPostingMode>("AUTO_ON_APPROVAL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const session = (await sessionResponse.json().catch(() => ({}))) as {
          user?: AdminUser;
        };

        if (!sessionResponse.ok || !session.user) {
          router.replace("/login");
          return;
        }
        if (!session.user.roles.includes("SUPER_ADMIN")) {
          router.replace("/dashboard");
          return;
        }

        const response = await fetch("/api/admin/settings/accounting", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as
          | AccountingConfiguration
          | ApiError;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!response.ok) {
          throw new Error(
            apiErrorMessage(
              payload as ApiError,
              "Unable to load accounting configuration.",
            ),
          );
        }

        if (!mounted) return;
        const config = payload as AccountingConfiguration;
        setSavedMode(config.depositPostingMode);
        setMode(config.depositPostingMode);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load accounting configuration.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings/accounting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositPostingMode: mode }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | AccountingConfiguration
        | ApiError;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            payload as ApiError,
            "Unable to save accounting configuration.",
          ),
        );
      }

      const config = payload as AccountingConfiguration;
      setSavedMode(config.depositPostingMode);
      setMode(config.depositPostingMode);
      setSuccess(config.message ?? "Accounting configuration updated.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save accounting configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.iconBox}>
            <i className="iconoir-coins" />
          </span>
          <div>
            <strong>Loading accounting configuration</strong>
            <p>Reading approved-deposit posting policy.</p>
          </div>
        </div>
      </section>
    );
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
          onClose={() => setSuccess(null)}
          autoDismissMs={5000}
        />
      ) : null}

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <i className="iconoir-coins" />
            SUPER ADMIN ACCOUNTING
          </div>
          <h2>Deposit Accounting</h2>
          <p>
            Choose whether approved deposits credit the Main / Deposit wallet
            automatically or wait in the manual reconciliation queue.
          </p>
        </div>

        <div
          className={
            mode === "AUTO_ON_APPROVAL"
              ? styles.fullBadge
              : styles.limitedBadge
          }
        >
          <i className="iconoir-coins" />
          {mode === "AUTO_ON_APPROVAL" ? "AUTO POSTING" : "MANUAL POSTING"}
        </div>
      </header>

      <PlatformSettingsNav active="accounting" />

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-flash" />
            </span>
            <div>
              <h3>Automatic on approval</h3>
              <p>
                Recommended. Approval immediately creates the idempotent,
                double-entry wallet credit.
              </p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              mode === "AUTO_ON_APPROVAL"
                ? styles.settingSafe
                : styles.settingWarning
            }`}
          >
            <div>
              <strong>Credit Main / Deposit after approval</strong>
              <p>
                If posting fails, the approved deposit remains recoverable in
                Accounting Pending and cannot double-credit on retry.
              </p>
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "AUTO_ON_APPROVAL"}
              className={`${styles.switch} ${
                mode === "AUTO_ON_APPROVAL" ? styles.switchOn : ""
              }`}
              onClick={() => {
                setMode("AUTO_ON_APPROVAL");
                setError(null);
                setSuccess(null);
              }}
            >
              <span />
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-task-list" />
            </span>
            <div>
              <h3>Manual reconciliation</h3>
              <p>
                Keep approved deposits in the accounting queue until an
                authorized operator posts them.
              </p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              mode === "MANUAL_RECONCILIATION"
                ? styles.settingSafe
                : styles.settingWarning
            }`}
          >
            <div>
              <strong>Require Post accounting</strong>
              <p>
                Intended for QA, migration, incident recovery, and controlled
                operational periods.
              </p>
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "MANUAL_RECONCILIATION"}
              className={`${styles.switch} ${
                mode === "MANUAL_RECONCILIATION" ? styles.switchOn : ""
              }`}
              onClick={() => {
                setMode("MANUAL_RECONCILIATION");
                setError(null);
                setSuccess(null);
              }}
            >
              <span />
            </button>
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>SUPER_ADMIN only · audited</strong>
          <p>
            Changing this policy never rewrites or reposts existing immutable
            ledger transactions. The selected mode applies to future approvals.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={mode === savedMode || saving}
            onClick={() => {
              setMode(savedMode);
              setError(null);
              setSuccess(null);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={mode === savedMode || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save accounting policy"}
          </button>
        </div>
      </footer>
    </section>
  );
}
