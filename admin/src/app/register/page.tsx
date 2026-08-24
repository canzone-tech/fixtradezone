/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type CreationMode = "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";

interface RegistrationPolicy {
  publicRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: CreationMode;
  usernameMode: CreationMode;
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
}

interface CaptchaDisabled {
  enabled: false;
  purpose: "REGISTRATION";
}

interface CaptchaChallenge {
  enabled: true;
  purpose: "REGISTRATION";
  challengeId: string;
  imageDataUri: string;
  expiresIn: number;
}

interface RegistrationResult {
  message: string;
  user: {
    id: string;
    email: string | null;
    username: string;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
  };
  temporaryPassword?: string;
  mustChangePassword?: boolean;
}

function readMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

async function getPolicy(): Promise<RegistrationPolicy> {
  const response = await fetch("/api/auth/registration-policy", {
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      readMessage(payload, "Unable to load registration policy."),
    );
  }

  return payload as RegistrationPolicy;
}

async function getCaptcha(): Promise<CaptchaDisabled | CaptchaChallenge> {
  const response = await fetch("/api/auth/captcha", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      purpose: "REGISTRATION",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readMessage(payload, "Unable to load security challenge."));
  }

  return payload as CaptchaDisabled | CaptchaChallenge;
}

export default function RegisterPage() {
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);

  async function reloadCaptcha() {
    setCaptchaLoading(true);
    setCaptchaAnswer("");

    try {
      const challenge = await getCaptcha();

      setCaptcha(challenge.enabled ? challenge : null);
    } catch (caught) {
      setCaptcha(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load security challenge.",
      );
    } finally {
      setCaptchaLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getPolicy(), getCaptcha()])
      .then(([nextPolicy, nextCaptcha]) => {
        if (cancelled) {
          return;
        }

        setPolicy(nextPolicy);
        setCaptcha(nextCaptcha.enabled ? nextCaptcha : null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to initialize registration.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const currentPolicy = policy;

    if (!currentPolicy?.publicRegistrationEnabled) {
      return;
    }

    setError("");

    if (
      currentPolicy.passwordMode !== "AUTO" &&
      password &&
      password !== confirmPassword
    ) {
      setError("Password confirmation does not match.");
      return;
    }

    if (currentPolicy.passwordMode === "MANUAL" && password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    if (captcha && !captchaAnswer.trim()) {
      setError("Enter the CAPTCHA answer.");
      return;
    }

    const body: Record<string, string> = {};

    if (firstName.trim()) {
      body.firstName = firstName.trim();
    }

    if (lastName.trim()) {
      body.lastName = lastName.trim();
    }

    if (email.trim()) {
      body.email = email.trim();
    }

    if (phone.trim()) {
      body.phone = phone.trim();
    }

    if (currentPolicy.usernameMode !== "AUTO" && username.trim()) {
      body.username = username.trim().toLowerCase();
    }

    if (currentPolicy.passwordMode !== "AUTO" && password) {
      body.password = password;
    }

    if (captcha) {
      body.captchaId = captcha.challengeId;
      body.captchaAnswer = captchaAnswer.trim();
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as RegistrationResult | null;

      if (!response.ok || !payload) {
        throw new Error(readMessage(payload, "Unable to register account."));
      }

      setResult(payload);
      setPassword("");
      setConfirmPassword("");
      setCaptchaAnswer("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to register account.",
      );

      if (captcha) {
        void reloadCaptcha();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ftz-auth-page">
      <section className="ftz-auth-visual" aria-label="FixTradeZone">
        <div className="ftz-auth-plasma" aria-hidden="true" />

        <div className="ftz-auth-brand">
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone"
            width={200}
            height={53}
            priority
          />
        </div>

        <div className="ftz-auth-story">
          <span className="ftz-auth-pill">
            <i className="iconoir-user-plus" />
            Secure Registration
          </span>

          <h1>
            Create your
            <span> FixTradeZone account.</span>
          </h1>

          <p>
            Registration follows the identity, credential and security policies
            configured by the platform.
          </p>
        </div>

        <div className="ftz-auth-bull" aria-hidden="true" />

        <div className="ftz-auth-trust">
          <span>
            <i className="iconoir-shield-check" />
            Policy controlled
          </span>

          <span>
            <i className="iconoir-lock" />
            Secure credentials
          </span>

          <span>
            <i className="iconoir-fingerprint" />
            Audit ready
          </span>
        </div>
      </section>

      <section className="ftz-auth-panel">
        <div className="ftz-auth-mobile-brand">
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone"
            width={190}
            height={50}
            priority
          />
        </div>

        <div className="ftz-login-card ftz-register-card">
          <div className="ftz-login-head">
            <span>ACCOUNT REGISTRATION</span>
            <h2>Create account</h2>

            <p>
              Already registered? <Link href="/login">Sign in here</Link>.
            </p>
          </div>

          {loading ? (
            <div className="ftz-register-state">
              <i className="iconoir-refresh-double" />
              Loading registration policy…
            </div>
          ) : null}

          {!loading && policy && !policy.publicRegistrationEnabled ? (
            <div className="ftz-register-state is-warning">
              <i className="iconoir-lock" />

              <div>
                <strong>Public registration is closed</strong>
                <span>
                  Account creation is currently available through authorized
                  platform operators only.
                </span>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="ftz-registration-success">
              <i className="iconoir-check-circle" />

              <div>
                <strong>{result.message}</strong>

                <span>
                  Username: <b>{result.user.username}</b>
                </span>

                <span>
                  Status: <b>{result.user.status}</b>
                </span>

                {result.temporaryPassword ? (
                  <div className="ftz-temporary-password">
                    <small>TEMPORARY PASSWORD — SHOWN ONCE</small>

                    <code>{result.temporaryPassword}</code>

                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          result.temporaryPassword ?? "",
                        )
                      }
                    >
                      <i className="iconoir-copy" />
                      Copy password
                    </button>

                    <p>
                      Save this password now. First login will require a
                      password change after account activation.
                    </p>
                  </div>
                ) : (
                  <p>
                    Account created successfully. Once activated, use the
                    credentials you selected to sign in.
                  </p>
                )}

                <Link className="ftz-auth-submit" href="/login">
                  <span>Continue to sign in</span>
                  <i className="iconoir-arrow-right" />
                </Link>
              </div>
            </div>
          ) : null}

          {!result && policy?.publicRegistrationEnabled ? (
            <form className="ftz-login-form" onSubmit={submit}>
              <div className="ftz-register-grid">
                <div>
                  <label htmlFor="register-first-name">First name</label>

                  <div className="ftz-auth-input">
                    <i className="iconoir-user" aria-hidden="true" />

                    <input
                      id="register-first-name"
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      maxLength={100}
                      autoComplete="given-name"
                      placeholder="First name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-last-name">Last name</label>

                  <div className="ftz-auth-input">
                    <i className="iconoir-user" aria-hidden="true" />

                    <input
                      id="register-last-name"
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      maxLength={100}
                      autoComplete="family-name"
                      placeholder="Last name"
                    />
                  </div>
                </div>
              </div>

              <label htmlFor="register-email">
                Email {policy.emailRequired ? "*" : ""}
              </label>

              <div className="ftz-auth-input">
                <i className="iconoir-mail" />

                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required={policy.emailRequired}
                  maxLength={191}
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </div>

              <div className="ftz-auth-label-row">
                <label htmlFor="register-mobile">
                  Mobile {policy.mobileRequired ? "*" : ""}
                </label>

                <small>E.164 format</small>
              </div>

              <div className="ftz-auth-input">
                <i className="iconoir-phone" />

                <input
                  id="register-mobile"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required={policy.mobileRequired}
                  maxLength={16}
                  autoComplete="tel"
                  placeholder="+919876543210"
                />
              </div>

              {policy.usernameMode !== "AUTO" ? (
                <>
                  <div className="ftz-auth-label-row">
                    <label htmlFor="register-username">
                      Username {policy.usernameMode === "MANUAL" ? "*" : ""}
                    </label>

                    <small>
                      {policy.usernameMode === "AUTO_OR_MANUAL"
                        ? "Optional"
                        : "Required"}
                    </small>
                  </div>

                  <div className="ftz-auth-input">
                    <i className="iconoir-user" />

                    <input
                      id="register-username"
                      type="text"
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value.toLowerCase())
                      }
                      required={policy.usernameMode === "MANUAL"}
                      minLength={3}
                      maxLength={30}
                      autoComplete="username"
                      placeholder="your.username"
                    />
                  </div>
                </>
              ) : (
                <div className="ftz-register-policy-note">
                  <i className="iconoir-magic-wand" />
                  Username will be generated automatically
                  {policy.usernamePrefixEnabled && policy.usernamePrefix
                    ? ` using prefix "${policy.usernamePrefix}".`
                    : "."}
                </div>
              )}

              {policy.passwordMode !== "AUTO" ? (
                <>
                  <div className="ftz-auth-label-row">
                    <label htmlFor="register-password">
                      Password {policy.passwordMode === "MANUAL" ? "*" : ""}
                    </label>

                    <small>
                      {policy.passwordMode === "AUTO_OR_MANUAL"
                        ? "Optional — blank generates temporary password"
                        : "Minimum 12 characters"}
                    </small>
                  </div>

                  <div className="ftz-auth-input">
                    <i className="iconoir-lock" />

                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required={policy.passwordMode === "MANUAL"}
                      minLength={
                        policy.passwordMode === "MANUAL" ? 12 : undefined
                      }
                      maxLength={128}
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      className="ftz-password-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      <i
                        className={
                          showPassword ? "iconoir-eye-closed" : "iconoir-eye"
                        }
                      />
                    </button>
                  </div>

                  {(password || policy.passwordMode === "MANUAL") && (
                    <>
                      <label htmlFor="register-confirm-password">
                        Confirm password
                      </label>

                      <div className="ftz-auth-input">
                        <i className="iconoir-key" />

                        <input
                          id="register-confirm-password"
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                          required={
                            policy.passwordMode === "MANUAL" ||
                            Boolean(password)
                          }
                          maxLength={128}
                          autoComplete="new-password"
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="ftz-register-policy-note">
                  <i className="iconoir-key" />A secure temporary password will
                  be generated and shown exactly once after registration.
                </div>
              )}

              {captchaLoading ? (
                <div className="ftz-captcha-loading">
                  Loading security challenge…
                </div>
              ) : null}

              {captcha ? (
                <div className="ftz-captcha">
                  <div className="ftz-captcha-head">
                    <div>
                      <strong>Security verification</strong>
                      <small>Registration CAPTCHA</small>
                    </div>

                    <button
                      type="button"
                      onClick={() => void reloadCaptcha()}
                      disabled={captchaLoading || submitting}
                      aria-label="Refresh CAPTCHA"
                    >
                      <i className="iconoir-refresh-double" />
                    </button>
                  </div>

                  <div className="ftz-captcha-image">
                    <img
                      src={captcha.imageDataUri}
                      alt="CAPTCHA security challenge"
                    />
                  </div>

                  <label htmlFor="registration-captcha">CAPTCHA answer</label>

                  <div className="ftz-auth-input">
                    <i className="iconoir-key" />

                    <input
                      id="registration-captcha"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={captchaAnswer}
                      onChange={(event) =>
                        setCaptchaAnswer(event.target.value.replace(/\D/g, ""))
                      }
                      maxLength={32}
                      required
                    />
                  </div>
                </div>
              ) : null}

              <div
                className={`ftz-auth-error ${error ? "is-visible" : ""}`}
                role="alert"
                aria-live="polite"
              >
                {error || " "}
              </div>

              <button
                className="ftz-auth-submit"
                type="submit"
                disabled={submitting || captchaLoading}
              >
                <span>
                  {submitting ? "Creating account…" : "Create account"}
                </span>

                <i className="iconoir-arrow-right" />
              </button>
            </form>
          ) : null}

          {!result && error && !policy?.publicRegistrationEnabled ? (
            <div className="ftz-auth-error is-visible">{error}</div>
          ) : null}
        </div>

        <p className="ftz-auth-footer">
          © 2026 FixTradeZone · Secure Registration
        </p>
      </section>
    </main>
  );
}
