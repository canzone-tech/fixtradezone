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

  const isAutomatic = mode === "AUTO_ON_APPROVAL";

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
            Select one posting mode for approved deposits. The modes are
            mutually exclusive and apply only to future approvals.
          </p>
        </div>

        <div className={isAutomatic ? styles.fullBadge : styles.limitedBadge}>
          <i className="iconoir-coins" />
          {isAutomatic ? "AUTO POSTING" : "MANUAL POSTING"}
        </div>
      </header>

      <PlatformSettingsNav active="accounting" />

      <div className={styles.grid}>
        <article className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-settings" />
            </span>
            <div>
              <h3>Approved deposit posting mode</h3>
              <p>
                Choose whether approval credits Main / Deposit immediately or
                waits for an authorized reconciliation action.
              </p>
            </div>
          </div>

          <label className={styles.field}>
            <span>Posting mode</span>
            <select
              className={styles.select}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as DepositPostingMode);
                setError(null);
                setSuccess(null);
              }}
            >
              <option value="AUTO_ON_APPROVAL">
                Automatic on approval — recommended
              </option>
              <option value="MANUAL_RECONCILIATION">
                Manual reconciliation
              </option>
            </select>
            <small className={styles.fieldHelp}>
              {isAutomatic
                ? "Approval immediately posts the idempotent double-entry Main / Deposit credit. If posting fails, the approved deposit remains recoverable in Accounting Pending."
                : "Approval leaves the deposit in Accounting Pending until an authorized operator uses Post accounting. Intended for QA, migration, incident recovery, or controlled operations."}
            </small>
          </label>
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
