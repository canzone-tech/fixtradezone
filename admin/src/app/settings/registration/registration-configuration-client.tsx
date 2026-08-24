"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import styles from "../platform-configuration.module.css";
import PlatformSettingsNav from "../platform-settings-nav";

type PasswordMode = "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";
type UsernameMode = "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";

interface AuthenticationConfiguration {
  loginWithUsername: boolean;
  loginWithEmail: boolean;
  loginWithMobile: boolean;
  captchaOnLoginEnabled: boolean;
  captchaOnRegistrationEnabled: boolean;
  updatedAt: string | null;
  message?: string;
}

interface RegistrationConfiguration {
  publicRegistrationEnabled: boolean;
  superAdminRegistrationEnabled: boolean;
  adminRegistrationEnabled: boolean;
  authorizedUserRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: PasswordMode;
  usernameMode: UsernameMode;
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
  allowMultipleAccountsPerEmail: boolean;
  allowMultipleAccountsPerMobile: boolean;
  updatedAt: string | null;
  message?: string;
}

type RegistrationDraft = Omit<
  RegistrationConfiguration,
  "updatedAt" | "message"
>;

interface ApiError {
  message?: string | string[];
}

function apiErrorMessage(payload: ApiError, fallback: string): string {
  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (Array.isArray(payload.message)) {
    return payload.message[0] ?? fallback;
  }

  return fallback;
}

function toDraft(config: RegistrationConfiguration): RegistrationDraft {
  return {
    publicRegistrationEnabled: config.publicRegistrationEnabled,
    superAdminRegistrationEnabled: config.superAdminRegistrationEnabled,
    adminRegistrationEnabled: config.adminRegistrationEnabled,
    authorizedUserRegistrationEnabled: config.authorizedUserRegistrationEnabled,
    emailRequired: config.emailRequired,
    mobileRequired: config.mobileRequired,
    passwordMode: config.passwordMode,
    usernameMode: config.usernameMode,
    usernamePrefixEnabled: config.usernamePrefixEnabled,
    usernamePrefix: config.usernamePrefix,
    allowMultipleAccountsPerEmail: config.allowMultipleAccountsPerEmail,
    allowMultipleAccountsPerMobile: config.allowMultipleAccountsPerMobile,
  };
}

export default function RegistrationConfigurationClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingCaptcha, setSavingCaptcha] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [savedRegistration, setSavedRegistration] =
    useState<RegistrationDraft | null>(null);

  const [draft, setDraft] = useState<RegistrationDraft | null>(null);

  const [authentication, setAuthentication] =
    useState<AuthenticationConfiguration | null>(null);

  const [savedRegistrationCaptcha, setSavedRegistrationCaptcha] =
    useState(false);

  const [registrationCaptcha, setRegistrationCaptcha] = useState(false);

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

        const [registrationResponse, authenticationResponse] =
          await Promise.all([
            fetch("/api/admin/settings/registration", {
              cache: "no-store",
            }),
            fetch("/api/admin/settings/authentication", {
              cache: "no-store",
            }),
          ]);

        if (
          registrationResponse.status === 401 ||
          authenticationResponse.status === 401
        ) {
          router.replace("/login");
          return;
        }

        if (
          registrationResponse.status === 403 ||
          authenticationResponse.status === 403
        ) {
          router.replace("/dashboard");
          return;
        }

        const registrationPayload = (await registrationResponse
          .json()
          .catch(() => ({}))) as RegistrationConfiguration | ApiError;

        const authenticationPayload = (await authenticationResponse
          .json()
          .catch(() => ({}))) as AuthenticationConfiguration | ApiError;

        if (!registrationResponse.ok) {
          throw new Error(
            apiErrorMessage(
              registrationPayload as ApiError,
              "Unable to load registration configuration.",
            ),
          );
        }

        if (!authenticationResponse.ok) {
          throw new Error(
            apiErrorMessage(
              authenticationPayload as ApiError,
              "Unable to load authentication configuration.",
            ),
          );
        }

        if (!mounted) {
          return;
        }

        const registration = registrationPayload as RegistrationConfiguration;

        const auth = authenticationPayload as AuthenticationConfiguration;

        const registrationDraft = toDraft(registration);

        setSavedRegistration(registrationDraft);
        setDraft(registrationDraft);
        setAuthentication(auth);
        setSavedRegistrationCaptcha(auth.captchaOnRegistrationEnabled);
        setRegistrationCaptcha(auth.captchaOnRegistrationEnabled);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load registration configuration.",
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

  if (loading || !draft || !savedRegistration || !authentication) {
    return (
      <section className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.iconBox}>
            <i className="iconoir-user-plus" />
          </span>

          <div>
            <strong>Loading registration configuration</strong>
            <p>Reading platform account creation policy.</p>
          </div>
        </div>
      </section>
    );
  }

  const usernameOnlyAuthentication =
    authentication.loginWithUsername &&
    !authentication.loginWithEmail &&
    !authentication.loginWithMobile;

  const policyChanged =
    JSON.stringify(draft) !== JSON.stringify(savedRegistration);

  const captchaChanged = registrationCaptcha !== savedRegistrationCaptcha;

  function update<K extends keyof RegistrationDraft>(
    key: K,
    value: RegistrationDraft[K],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );

    setError(null);
    setSuccess(null);
  }

  function updateMultipleAccountMode(
    key: "allowMultipleAccountsPerEmail" | "allowMultipleAccountsPerMobile",
    enabled: boolean,
  ) {
    if (enabled && !usernameOnlyAuthentication) {
      setError(
        "Multi-account mode requires username-only authentication first.",
      );
      return;
    }

    update(key, enabled);
  }

  async function savePolicy() {
    const currentDraft = draft;

    if (!currentDraft) {
      return;
    }

    setError(null);
    setSuccess(null);

    const { usernamePrefix, ...basePayload } = currentDraft;
    const prefix = usernamePrefix?.trim().toLowerCase() ?? "";

    if (draft.usernamePrefixEnabled && !/^[a-z0-9_-]{1,20}$/.test(prefix)) {
      setError(
        "Username prefix must contain 1–20 lowercase letters, numbers, underscores or hyphens.",
      );
      return;
    }

    setSavingPolicy(true);

    try {
      const body = {
        ...basePayload,
        ...(prefix ? { usernamePrefix: prefix } : {}),
      };

      const response = await fetch("/api/admin/settings/registration", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as
        RegistrationConfiguration | ApiError;

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
            "Unable to save registration configuration.",
          ),
        );
      }

      const config = payload as RegistrationConfiguration;
      const nextDraft = toDraft(config);

      setDraft(nextDraft);
      setSavedRegistration(nextDraft);
      setSuccess(config.message ?? "Registration configuration updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save registration configuration.",
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  async function saveCaptcha() {
    setError(null);
    setSuccess(null);
    setSavingCaptcha(true);

    try {
      const response = await fetch("/api/admin/settings/authentication", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          captchaOnRegistrationEnabled: registrationCaptcha,
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
            "Unable to save registration CAPTCHA configuration.",
          ),
        );
      }

      const config = payload as AuthenticationConfiguration;

      setAuthentication(config);
      setRegistrationCaptcha(config.captchaOnRegistrationEnabled);
      setSavedRegistrationCaptcha(config.captchaOnRegistrationEnabled);
      setSuccess("Registration CAPTCHA configuration updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save registration CAPTCHA configuration.",
      );
    } finally {
      setSavingCaptcha(false);
    }
  }

  function resetPolicy() {
    setDraft(savedRegistration);
    setError(null);
    setSuccess(null);
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <i className="iconoir-user-plus" />
            SUPER ADMIN REGISTRATION
          </div>

          <h2>Registration Settings</h2>

          <p>
            Control who may create accounts and how platform identities and
            credentials are generated.
          </p>
        </div>

        <div
          className={
            draft.publicRegistrationEnabled
              ? styles.fullBadge
              : styles.limitedBadge
          }
        >
          <i className="iconoir-community" />
          {draft.publicRegistrationEnabled
            ? "PUBLIC OPEN"
            : "CONTROLLED ACCESS"}
        </div>
      </header>

      <PlatformSettingsNav active="registration" />

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
              <i className="iconoir-community" />
            </span>

            <div>
              <h3>Registration Sources</h3>
              <p>Choose which actors are allowed to create user accounts.</p>
            </div>
          </div>

          {[
            {
              key: "publicRegistrationEnabled" as const,
              label: "Public registration",
              description: "Allow users to create their own account.",
            },
            {
              key: "superAdminRegistrationEnabled" as const,
              label: "SUPER_ADMIN registration",
              description: "Allow SUPER_ADMIN to create user accounts.",
            },
            {
              key: "adminRegistrationEnabled" as const,
              label: "ADMIN registration",
              description: "Allow permitted ADMIN users to create accounts.",
            },
            {
              key: "authorizedUserRegistrationEnabled" as const,
              label: "Authorized USER registration",
              description:
                "Allow specifically authorized users to create accounts.",
            },
          ].map((item) => (
            <div
              key={item.key}
              className={`${styles.settingRow} ${
                draft[item.key] ? styles.settingSafe : styles.settingWarning
              }`}
            >
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={draft[item.key]}
                className={`${styles.switch} ${
                  draft[item.key] ? styles.switchOn : ""
                }`}
                onClick={() => update(item.key, !draft[item.key])}
              >
                <span />
              </button>
            </div>
          ))}
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-profile-circle" />
            </span>

            <div>
              <h3>Required Identifiers</h3>
              <p>Define which contact identifiers registration must collect.</p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              draft.emailRequired ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>Email required</strong>
              <p>Require an email address during account registration.</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draft.emailRequired}
              className={`${styles.switch} ${
                draft.emailRequired ? styles.switchOn : ""
              }`}
              onClick={() => update("emailRequired", !draft.emailRequired)}
            >
              <span />
            </button>
          </div>

          <div
            className={`${styles.settingRow} ${
              draft.mobileRequired ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>Mobile required</strong>
              <p>Require an E.164 mobile number during registration.</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draft.mobileRequired}
              className={`${styles.switch} ${
                draft.mobileRequired ? styles.switchOn : ""
              }`}
              onClick={() => update("mobileRequired", !draft.mobileRequired)}
            >
              <span />
            </button>
          </div>

          <div className={styles.note}>
            <i className="iconoir-info-circle" />
            Username remains the unique human account handle regardless of
            contact requirements.
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-key" />
            </span>

            <div>
              <h3>Credential Creation</h3>
              <p>Configure password and username generation behavior.</p>
            </div>
          </div>

          <div className={styles.modeGrid}>
            <label className={styles.field}>
              <span>Password creation</span>

              <select
                className={styles.select}
                value={draft.passwordMode}
                onChange={(event) =>
                  update("passwordMode", event.target.value as PasswordMode)
                }
              >
                <option value="AUTO">AUTO</option>
                <option value="MANUAL">MANUAL</option>
                <option value="AUTO_OR_MANUAL">AUTO OR MANUAL</option>
              </select>

              <small className={styles.fieldHelp}>
                AUTO passwords are generated securely and shown once.
              </small>
            </label>

            <label className={styles.field}>
              <span>Username creation</span>

              <select
                className={styles.select}
                value={draft.usernameMode}
                onChange={(event) =>
                  update("usernameMode", event.target.value as UsernameMode)
                }
              >
                <option value="AUTO">AUTO</option>
                <option value="MANUAL">MANUAL</option>
                <option value="AUTO_OR_MANUAL">AUTO OR MANUAL</option>
              </select>

              <small className={styles.fieldHelp}>
                AUTO usernames use the platform sequence generator.
              </small>
            </label>
          </div>

          <div
            className={`${styles.settingRow} ${
              draft.usernamePrefixEnabled
                ? styles.settingSafe
                : styles.settingWarning
            }`}
          >
            <div>
              <strong>Generated username prefix</strong>
              <p>Apply a configured prefix to future generated usernames.</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draft.usernamePrefixEnabled}
              className={`${styles.switch} ${
                draft.usernamePrefixEnabled ? styles.switchOn : ""
              }`}
              onClick={() =>
                update("usernamePrefixEnabled", !draft.usernamePrefixEnabled)
              }
            >
              <span />
            </button>
          </div>

          <label className={styles.field}>
            <span>Username prefix</span>

            <input
              className={styles.textInput}
              type="text"
              value={draft.usernamePrefix ?? ""}
              disabled={!draft.usernamePrefixEnabled}
              maxLength={20}
              placeholder="ftz"
              onChange={(event) =>
                update(
                  "usernamePrefix",
                  event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                )
              }
            />

            <small className={styles.fieldHelp}>
              1–20 lowercase letters, numbers, underscores or hyphens.
            </small>
          </label>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-multiple-pages" />
            </span>

            <div>
              <h3>Multiple Accounts</h3>
              <p>
                Control whether contact identifiers may belong to more than one
                account.
              </p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              draft.allowMultipleAccountsPerEmail
                ? styles.settingWarning
                : styles.settingSafe
            }`}
          >
            <div>
              <strong>Multiple accounts per email</strong>
              <p>Allow more than one user account to share an email.</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draft.allowMultipleAccountsPerEmail}
              className={`${styles.switch} ${
                draft.allowMultipleAccountsPerEmail ? styles.switchOn : ""
              }`}
              onClick={() =>
                updateMultipleAccountMode(
                  "allowMultipleAccountsPerEmail",
                  !draft.allowMultipleAccountsPerEmail,
                )
              }
            >
              <span />
            </button>
          </div>

          <div
            className={`${styles.settingRow} ${
              draft.allowMultipleAccountsPerMobile
                ? styles.settingWarning
                : styles.settingSafe
            }`}
          >
            <div>
              <strong>Multiple accounts per mobile</strong>
              <p>Allow more than one user account to share a mobile number.</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draft.allowMultipleAccountsPerMobile}
              className={`${styles.switch} ${
                draft.allowMultipleAccountsPerMobile ? styles.switchOn : ""
              }`}
              onClick={() =>
                updateMultipleAccountMode(
                  "allowMultipleAccountsPerMobile",
                  !draft.allowMultipleAccountsPerMobile,
                )
              }
            >
              <span />
            </button>
          </div>

          {!usernameOnlyAuthentication ? (
            <div className={styles.warningNote}>
              <i className="iconoir-warning-triangle" />

              <span>
                Multi-account mode requires username-only login. Configure this
                first under{" "}
                <Link href="/settings/authentication">
                  Authentication Settings
                </Link>
                .
              </span>
            </div>
          ) : (
            <div className={styles.note}>
              <i className="iconoir-check-circle" />
              Username-only authentication is active. Multi-account mode may be
              enabled.
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.iconBox}>
              <i className="iconoir-fingerprint" />
            </span>

            <div>
              <h3>Registration CAPTCHA</h3>
              <p>
                Protect public registration using the server-authoritative
                CAPTCHA challenge.
              </p>
            </div>
          </div>

          <div
            className={`${styles.settingRow} ${
              registrationCaptcha ? styles.settingSafe : styles.settingWarning
            }`}
          >
            <div>
              <strong>
                {registrationCaptcha ? "CAPTCHA enabled" : "CAPTCHA disabled"}
              </strong>

              <p>
                Challenge verification is short-lived, single-use and
                server-side.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={registrationCaptcha}
              className={`${styles.switch} ${
                registrationCaptcha ? styles.switchOn : ""
              }`}
              onClick={() => {
                setRegistrationCaptcha((current) => !current);
                setError(null);
                setSuccess(null);
              }}
            >
              <span />
            </button>
          </div>

          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.primary}
              disabled={!captchaChanged || savingCaptcha}
              onClick={() => void saveCaptcha()}
            >
              <i className="iconoir-check" />
              {savingCaptcha ? "Saving..." : "Save CAPTCHA"}
            </button>
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>Registration policy</strong>
          <p>
            Changes are validated by the backend and recorded in the platform
            audit log.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={!policyChanged || savingPolicy}
            onClick={resetPolicy}
          >
            Reset
          </button>

          <button
            type="button"
            className={styles.primary}
            disabled={!policyChanged || savingPolicy}
            onClick={() => void savePolicy()}
          >
            <i className="iconoir-check" />
            {savingPolicy ? "Saving..." : "Save Registration Policy"}
          </button>
        </div>
      </footer>
    </section>
  );
}
