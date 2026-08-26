"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "../platform-configuration.module.css";

interface SecurityConfiguration {
  fullUserImpersonationEnabled: boolean;
  idleLockMinutes: number;
  updatedAt: string | null;
}

interface ApiError {
  message?: string;
}

const IDLE_PRESETS = [5, 10, 15, 30];

export default function SecurityConfigurationClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedConfig, setSavedConfig] = useState<SecurityConfiguration | null>(
    null,
  );

  const [fullUserImpersonationEnabled, setFullUserImpersonationEnabled] =
    useState(false);

  const [idleLockMinutes, setIdleLockMinutes] = useState(5);

  useEffect(() => {
    let mounted = true;

    async function loadConfiguration() {
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

        const response = await fetch("/api/admin/settings/security", {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => ({}))) as
          SecurityConfiguration | ApiError;

        if (response.status === 403) {
          router.replace("/dashboard");
          return;
        }

        if (!response.ok) {
          throw new Error(
            "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Unable to load security configuration.",
          );
        }

        if (!mounted) {
          return;
        }

        const config = payload as SecurityConfiguration;

        setSavedConfig(config);
        setFullUserImpersonationEnabled(config.fullUserImpersonationEnabled);
        setIdleLockMinutes(config.idleLockMinutes);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load security configuration.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadConfiguration();

    return () => {
      mounted = false;
    };
  }, [router]);

  const hasChanges =
    savedConfig !== null &&
    (savedConfig.fullUserImpersonationEnabled !==
      fullUserImpersonationEnabled ||
      savedConfig.idleLockMinutes !== idleLockMinutes);

  async function saveConfiguration() {
    if (
      !Number.isInteger(idleLockMinutes) ||
      idleLockMinutes < 1 ||
      idleLockMinutes > 120
    ) {
      setError("Idle lock must be between 1 and 120 minutes.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullUserImpersonationEnabled,
          idleLockMinutes,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        SecurityConfiguration | ApiError;

      if (response.status === 403) {
        router.replace("/dashboard");
        return;
      }

      if (!response.ok) {
        throw new Error(
          "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Unable to save security configuration.",
        );
      }

      const config = payload as SecurityConfiguration;

      setSavedConfig(config);
      setFullUserImpersonationEnabled(config.fullUserImpersonationEnabled);
      setIdleLockMinutes(config.idleLockMinutes);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save security configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetConfiguration() {
    if (!savedConfig) {
      return;
    }

    setFullUserImpersonationEnabled(savedConfig.fullUserImpersonationEnabled);
    setIdleLockMinutes(savedConfig.idleLockMinutes);
    setError(null);
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.iconBox}>
            <i className="iconoir-settings" />
          </span>

          <div>
            <strong>Loading security configuration</strong>
            <p>Reading current platform policy.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <i className="iconoir-shield-check" />
            SUPER ADMIN SECURITY
          </div>

          <h2>Security Configuration</h2>

          <p>
            Configure user impersonation access and automatic session locking.
          </p>
        </div>

        <div
          className={
            fullUserImpersonationEnabled
              ? styles.fullBadge
              : styles.limitedBadge
          }
        >
          <i
            className={
              fullUserImpersonationEnabled
                ? "iconoir-warning-triangle"
                : "iconoir-shield-check"
            }
          />

          {fullUserImpersonationEnabled ? "FULL IMPERSONATION" : "LIMITED MODE"}
        </div>
      </header>

      <PlatformSettingsNav active="security" />

      {error ? (
        <div className={styles.error} role="alert">
          <i className="iconoir-warning-circle" />
          {error}
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-user" />
            </span>

            <div>
              <h3>Full User Impersonation</h3>
              <p>Controls complete access to the selected USER account.</p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              fullUserImpersonationEnabled
                ? styles.settingWarning
                : styles.settingSafe
            }`}
          >
            <div>
              <strong>
                {fullUserImpersonationEnabled
                  ? "Full access enabled"
                  : "Limited support mode"}
              </strong>

              <p>
                {fullUserImpersonationEnabled
                  ? "Authorized impersonation sessions receive the selected USER's full user-side capabilities."
                  : "Impersonated sessions remain inside the approved limited support boundary."}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={fullUserImpersonationEnabled}
              className={`${styles.switch} ${
                fullUserImpersonationEnabled ? styles.switchOn : ""
              }`}
              onClick={() =>
                setFullUserImpersonationEnabled((current) => !current)
              }
            >
              <span />
            </button>
          </div>

          <div className={styles.note}>
            <i className="iconoir-lock" />
            Admin privileges never leak into the selected USER identity.
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-timer" />
            </span>

            <div>
              <h3>Idle Session Lock</h3>
              <p>Lock inactive sessions without logging the operator out.</p>
            </div>
          </div>

          <label className={styles.field}>
            <span>Idle timeout</span>

            <div className={styles.inputWrap}>
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                value={idleLockMinutes}
                onChange={(event) =>
                  setIdleLockMinutes(Number(event.target.value))
                }
              />

              <strong>minutes</strong>
            </div>
          </label>

          <div className={styles.presets}>
            {IDLE_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={
                  idleLockMinutes === minutes
                    ? styles.presetActive
                    : styles.preset
                }
                onClick={() => setIdleLockMinutes(minutes)}
              >
                {minutes} min
              </button>
            ))}
          </div>

          <div className={styles.note}>
            <i className="iconoir-key" />
            Unlock requires password verification and returns to the same
            screen.
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>SUPER_ADMIN only</strong>
          <p>
            Security configuration changes are validated and audited by the
            backend.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={!hasChanges || saving}
            onClick={resetConfiguration}
          >
            Reset
          </button>

          <button
            type="button"
            className={styles.primary}
            disabled={!hasChanges || saving}
            onClick={() => void saveConfiguration()}
          >
            <i className="iconoir-check" />

            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </footer>
    </section>
  );
}
