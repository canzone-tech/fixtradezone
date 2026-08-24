"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "../platform-configuration.module.css";

interface AuthenticationConfiguration {
  loginWithUsername: boolean;
  loginWithEmail: boolean;
  loginWithMobile: boolean;
  captchaOnLoginEnabled: boolean;
  captchaOnRegistrationEnabled: boolean;
  updatedAt: string | null;
  message?: string;
}

interface ApiError {
  message?: string | string[];
}

type LoginMethod = "username" | "email" | "mobile";

function apiErrorMessage(payload: ApiError, fallback: string): string {
  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (Array.isArray(payload.message)) {
    return payload.message[0] ?? fallback;
  }

  return fallback;
}

export default function AuthenticationConfigurationClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [savedConfig, setSavedConfig] =
    useState<AuthenticationConfiguration | null>(null);

  const [loginWithUsername, setLoginWithUsername] = useState(true);
  const [loginWithEmail, setLoginWithEmail] = useState(true);
  const [loginWithMobile, setLoginWithMobile] = useState(true);
  const [captchaOnLoginEnabled, setCaptchaOnLoginEnabled] = useState(false);

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

        const response = await fetch("/api/admin/settings/authentication", {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => ({}))) as
          AuthenticationConfiguration | ApiError;

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
              "Unable to load authentication configuration.",
            ),
          );
        }

        if (!mounted) {
          return;
        }

        const config = payload as AuthenticationConfiguration;

        setSavedConfig(config);
        setLoginWithUsername(config.loginWithUsername);
        setLoginWithEmail(config.loginWithEmail);
        setLoginWithMobile(config.loginWithMobile);
        setCaptchaOnLoginEnabled(config.captchaOnLoginEnabled);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load authentication configuration.",
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

  const enabledLoginMethodCount = [
    loginWithUsername,
    loginWithEmail,
    loginWithMobile,
  ].filter(Boolean).length;

  const hasChanges =
    savedConfig !== null &&
    (savedConfig.loginWithUsername !== loginWithUsername ||
      savedConfig.loginWithEmail !== loginWithEmail ||
      savedConfig.loginWithMobile !== loginWithMobile ||
      savedConfig.captchaOnLoginEnabled !== captchaOnLoginEnabled);

  function setLoginMethod(method: LoginMethod, next: boolean) {
    setError(null);
    setSuccess(null);

    const current =
      method === "username"
        ? loginWithUsername
        : method === "email"
          ? loginWithEmail
          : loginWithMobile;

    if (current && !next && enabledLoginMethodCount === 1) {
      setError("At least one login method must remain enabled.");
      return;
    }

    if (method === "username") {
      setLoginWithUsername(next);
      return;
    }

    if (method === "email") {
      setLoginWithEmail(next);
      return;
    }

    setLoginWithMobile(next);
  }

  async function saveConfiguration() {
    if (enabledLoginMethodCount < 1) {
      setError("At least one login method must remain enabled.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings/authentication", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginWithUsername,
          loginWithEmail,
          loginWithMobile,
          captchaOnLoginEnabled,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        AuthenticationConfiguration | ApiError;

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
            "Unable to save authentication configuration.",
          ),
        );
      }

      const config = payload as AuthenticationConfiguration;

      setSavedConfig(config);
      setLoginWithUsername(config.loginWithUsername);
      setLoginWithEmail(config.loginWithEmail);
      setLoginWithMobile(config.loginWithMobile);
      setCaptchaOnLoginEnabled(config.captchaOnLoginEnabled);
      setSuccess(config.message ?? "Authentication configuration updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save authentication configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetConfiguration() {
    if (!savedConfig) {
      return;
    }

    setLoginWithUsername(savedConfig.loginWithUsername);
    setLoginWithEmail(savedConfig.loginWithEmail);
    setLoginWithMobile(savedConfig.loginWithMobile);
    setCaptchaOnLoginEnabled(savedConfig.captchaOnLoginEnabled);
    setError(null);
    setSuccess(null);
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.iconBox}>
            <i className="iconoir-key" />
          </span>

          <div>
            <strong>Loading authentication configuration</strong>
            <p>Reading current platform login policy.</p>
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
            SUPER ADMIN AUTHENTICATION
          </div>

          <h2>Authentication Settings</h2>

          <p>
            Configure accepted login identifiers and login CAPTCHA protection.
          </p>
        </div>

        <div
          className={
            captchaOnLoginEnabled ? styles.fullBadge : styles.limitedBadge
          }
        >
          <i
            className={
              captchaOnLoginEnabled ? "iconoir-shield-check" : "iconoir-key"
            }
          />

          {captchaOnLoginEnabled ? "CAPTCHA ENABLED" : "STANDARD LOGIN"}
        </div>
      </header>

      <PlatformSettingsNav active="authentication" />

      {error ? (
        <div className={styles.error} role="alert">
          <i className="iconoir-warning-circle" />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className={styles.note} role="status">
          <i className="iconoir-check-circle" />
          {success}
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-user" />
            </span>

            <div>
              <h3>Username Login</h3>
              <p>Allow users to authenticate using their unique username.</p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              loginWithUsername ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>
                {loginWithUsername ? "Username enabled" : "Username disabled"}
              </strong>
              <p>
                Username remains the canonical human account handle even when
                this login method is disabled.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={loginWithUsername}
              className={`${styles.switch} ${
                loginWithUsername ? styles.switchOn : ""
              }`}
              onClick={() => setLoginMethod("username", !loginWithUsername)}
            >
              <span />
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-mail" />
            </span>

            <div>
              <h3>Email Login</h3>
              <p>Allow authentication using the account email address.</p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              loginWithEmail ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>
                {loginWithEmail ? "Email enabled" : "Email disabled"}
              </strong>
              <p>
                Multi-account email mode requires username-only authentication.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={loginWithEmail}
              className={`${styles.switch} ${
                loginWithEmail ? styles.switchOn : ""
              }`}
              onClick={() => setLoginMethod("email", !loginWithEmail)}
            >
              <span />
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-phone" />
            </span>

            <div>
              <h3>Mobile Login</h3>
              <p>Allow authentication using an E.164 mobile number.</p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              loginWithMobile ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>
                {loginWithMobile ? "Mobile enabled" : "Mobile disabled"}
              </strong>
              <p>
                Multi-account mobile mode requires username-only authentication.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={loginWithMobile}
              className={`${styles.switch} ${
                loginWithMobile ? styles.switchOn : ""
              }`}
              onClick={() => setLoginMethod("mobile", !loginWithMobile)}
            >
              <span />
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-fingerprint" />
            </span>

            <div>
              <h3>Login CAPTCHA</h3>
              <p>
                Require the server-authoritative security challenge on login.
              </p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              captchaOnLoginEnabled ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>
                {captchaOnLoginEnabled
                  ? "CAPTCHA protection enabled"
                  : "CAPTCHA protection disabled"}
              </strong>
              <p>
                Challenges are short-lived, single-use and verified by the
                backend.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={captchaOnLoginEnabled}
              className={`${styles.switch} ${
                captchaOnLoginEnabled ? styles.switchOn : ""
              }`}
              onClick={() => {
                setCaptchaOnLoginEnabled((current) => !current);
                setError(null);
                setSuccess(null);
              }}
            >
              <span />
            </button>
          </div>

          <div className={styles.note}>
            <i className="iconoir-lock" />
            Registration CAPTCHA is configured separately under Registration
            Settings.
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>SUPER_ADMIN only</strong>
          <p>
            Authentication changes are validated against platform invariants and
            recorded in the audit log.
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
