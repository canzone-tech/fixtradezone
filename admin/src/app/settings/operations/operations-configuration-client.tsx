"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  notifyPlatformTimezoneChanged,
  usePlatformTime,
} from "@/components/platform/platform-time-provider";
import FlashMessage from "@/components/ui/flash-message";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime, isValidTimeZone } from "@/lib/platform-time";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "../platform-configuration.module.css";

type OperationsMode = "AUTOMATIC" | "CONTROLLED_MANUAL";

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

interface OperationsConfiguration {
  platformTimezone: string;
  operationsMode: OperationsMode;
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

function supportedTimeZones(current: string): string[] {
  const runtimeIntl = Intl as IntlWithSupportedValues;
  const runtimeZones = runtimeIntl.supportedValuesOf?.("timeZone") ?? [];
  const values = runtimeZones.length > 0 ? runtimeZones : FALLBACK_TIMEZONES;

  return Array.from(new Set(["Asia/Kolkata", "UTC", current, ...values]))
    .filter((timeZone) => isValidTimeZone(timeZone))
    .sort((left, right) => left.localeCompare(right));
}

function timeZoneLabel(timeZone: string): string {
  if (timeZone === "Asia/Kolkata") {
    return "Asia/Kolkata — India Standard Time (IST)";
  }
  if (timeZone === "UTC") {
    return "UTC — Coordinated Universal Time";
  }
  return timeZone;
}

export default function OperationsConfigurationClient() {
  const router = useRouter();
  const { timeZone } = usePlatformTime();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<OperationsConfiguration | null>(null);
  const [platformTimezone, setPlatformTimezone] = useState("Asia/Kolkata");
  const [operationsMode, setOperationsMode] =
    useState<OperationsMode>("AUTOMATIC");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const timeZones = useMemo(
    () => supportedTimeZones(platformTimezone),
    [platformTimezone],
  );

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

        const response = await fetch("/api/admin/settings/operations", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as
          | OperationsConfiguration
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
              "Unable to load operations configuration.",
            ),
          );
        }

        if (!mounted) return;
        const config = payload as OperationsConfiguration;
        setSaved(config);
        setPlatformTimezone(config.platformTimezone);
        setOperationsMode(config.operationsMode);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load operations configuration.",
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
    setError(null);
    setSuccess(null);

    const timezone = platformTimezone.trim();
    if (!isValidTimeZone(timezone)) {
      setError("Select a valid platform timezone from the list.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformTimezone: timezone,
          operationsMode,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | OperationsConfiguration
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
            "Unable to save operations configuration.",
          ),
        );
      }

      const config = payload as OperationsConfiguration;
      setSaved(config);
      setPlatformTimezone(config.platformTimezone);
      setOperationsMode(config.operationsMode);
      setSuccess(config.message ?? "Operations configuration updated.");
      notifyPlatformTimezoneChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save operations configuration.",
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
            <i className="iconoir-settings" />
          </span>
          <div>
            <strong>Loading operations configuration</strong>
            <p>Reading the single automation mode and platform timezone.</p>
          </div>
        </div>
      </section>
    );
  }

  const isAutomatic = operationsMode === "AUTOMATIC";

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
            <i className="iconoir-settings" />
            SUPER ADMIN OPERATIONS
          </div>
          <h2>Platform Operations</h2>
          <p>
            Keep normal operation simple: one approval can post accounting,
            activate an eligible package, process referral commission, and
            initialize its reward lifecycle. Manual actions remain recovery
            tools, not the everyday workflow.
          </p>
        </div>

        <div className={isAutomatic ? styles.fullBadge : styles.limitedBadge}>
          <i className={isAutomatic ? "iconoir-flash" : "iconoir-tools"} />
          {isAutomatic ? "AUTOMATIC" : "CONTROLLED MANUAL"}
        </div>
      </header>

      <PlatformSettingsNav active="operations" />

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-clock" />
            </span>
            <div>
              <h3>Platform timezone</h3>
              <p>
                Admin and USER screens render operational timestamps using this
                timezone. Financial records continue storing absolute timestamps
                and immutable settlement snapshots for auditability.
              </p>
            </div>
          </div>

          <label className={styles.field}>
            <span>Platform timezone</span>
            <select
              className={styles.select}
              value={platformTimezone}
              onChange={(event) => {
                setPlatformTimezone(event.target.value);
                setError(null);
                setSuccess(null);
              }}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {timeZoneLabel(zone)}
                </option>
              ))}
            </select>
            <small className={styles.fieldHelp}>
              Choose from supported IANA timezones. Recommended: Asia/Kolkata —
              India Standard Time (IST). Current display setting: {timeZone}.
            </small>
          </label>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-flash" />
            </span>
            <div>
              <h3>Operations mode</h3>
              <p>
                One high-level switch controls the normal deposit-to-earnings
                happy path. Package-specific business rules are still respected.
              </p>
            </div>
          </div>

          <label className={styles.field}>
            <span>Mode</span>
            <select
              className={styles.select}
              value={operationsMode}
              onChange={(event) => {
                setOperationsMode(event.target.value as OperationsMode);
                setError(null);
                setSuccess(null);
              }}
            >
              <option value="AUTOMATIC">Automatic — recommended</option>
              <option value="CONTROLLED_MANUAL">
                Controlled Manual — recovery / QA
              </option>
            </select>
            <small className={styles.fieldHelp}>
              {isAutomatic
                ? "Approve deposit once → ledger posting → eligible package activation → referral commission processing → reward lifecycle initialization. Daily rewards remain scheduled for their due boundary."
                : "Approval stops after review. Authorized recovery actions handle accounting and package activation deliberately; scheduled automatic reward processing is paused."}
            </small>
          </label>
        </article>

        <article className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-shield-check" />
            </span>
            <div>
              <h3>Safety boundaries</h3>
              <p>
                Automation never bypasses package activation rules, immutable
                subscription snapshots, idempotent ledger posting, cap rules,
                commission-plan eligibility, or reward-policy eligibility.
              </p>
            </div>
          </div>
          <div className={styles.warningNote}>
            <i className="iconoir-shield-check" />
            <div>
              Manual package plans remain manual even in Automatic mode. Daily
              reward is not paid immediately on deposit approval. Failed
              downstream stages stay recoverable without undoing a successful
              prior stage. Existing financial history is never rewritten by a
              settings change.
            </div>
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>SUPER_ADMIN only · audited</strong>
          <p>
            Last update: {formatPlatformDateTime(saved?.updatedAt, timeZone)}
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void save()}
          disabled={saving}
        >
          <i className={saving ? "iconoir-refresh-double" : "iconoir-check"} />
          {saving ? "Saving…" : "Save operations"}
        </button>
      </footer>
    </section>
  );
}
