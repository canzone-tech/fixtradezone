/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ErrorPayload {
  message?: string;
}

interface CaptchaDisabled {
  enabled: false;
  purpose: "LOGIN";
}

interface CaptchaChallenge {
  enabled: true;
  purpose: "LOGIN";
  challengeId: string;
  imageDataUri: string;
  expiresIn: number;
}

interface LoginSuccessPayload {
  passwordChangeRequired?: boolean;
  redirectTo?: "/dashboard" | "/user/dashboard";
}

async function requestLoginCaptcha(): Promise<
  CaptchaDisabled | CaptchaChallenge
> {
  const response = await fetch("/api/auth/captcha", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      purpose: "LOGIN",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as
    CaptchaDisabled | CaptchaChallenge | ErrorPayload;

  if (!response.ok) {
    throw new Error(
      "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Unable to load security challenge.",
    );
  }

  if ("enabled" in payload && payload.enabled === false) {
    return {
      enabled: false,
      purpose: "LOGIN",
    };
  }

  if (
    "enabled" in payload &&
    payload.enabled === true &&
    typeof payload.challengeId === "string" &&
    typeof payload.imageDataUri === "string" &&
    typeof payload.expiresIn === "number"
  ) {
    return {
      enabled: true,
      purpose: "LOGIN",
      challengeId: payload.challengeId,
      imageDataUri: payload.imageDataUri,
      expiresIn: payload.expiresIn,
    };
  }

  throw new Error("Security challenge returned an invalid response.");
}

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [captchaError, setCaptchaError] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCaptcha() {
    setCaptchaLoading(true);
    setCaptchaError("");
    setCaptchaAnswer("");

    try {
      const challenge = await requestLoginCaptcha();
      setCaptcha(challenge.enabled ? challenge : null);
    } catch (loadError) {
      setCaptcha(null);
      setCaptchaError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load security challenge.",
      );
    } finally {
      setCaptchaLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void requestLoginCaptcha()
      .then((challenge) => {
        if (cancelled) {
          return;
        }

        setCaptcha(challenge.enabled ? challenge : null);
        setCaptchaError("");
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }

        setCaptcha(null);
        setCaptchaError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load security challenge.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setCaptchaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (captchaLoading) {
      setError("Security challenge is still loading.");
      return;
    }

    if (captchaError) {
      setError("Security challenge is unavailable. Refresh and try again.");
      return;
    }

    if (captcha && !captchaAnswer.trim()) {
      setError("Enter the CAPTCHA answer.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          ...(captcha
            ? {
                captchaId: captcha.challengeId,
                captchaAnswer: captchaAnswer.trim(),
              }
            : {}),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        ErrorPayload | LoginSuccessPayload;

      if (!response.ok) {
        setError(
          "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Unable to sign in.",
        );

        if (captcha) {
          void loadCaptcha();
        }

        return;
      }

      if (
        "passwordChangeRequired" in payload &&
        payload.passwordChangeRequired === true
      ) {
        router.replace("/change-required-password");
        return;
      }

      const redirectTo =
        "redirectTo" in payload && payload.redirectTo === "/user/dashboard"
          ? "/user/dashboard"
          : "/dashboard";

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to reach the admin service. Please try again.");

      if (captcha) {
        void loadCaptcha();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="ftz-auth-page">
      <section className="ftz-auth-visual" aria-label="FixTradeZone">
        <div className="ftz-auth-plasma" aria-hidden="true" />

        <div className="ftz-auth-brand">
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone Admin Portal"
            width={200}
            height={53}
            priority
          />
        </div>

        <div className="ftz-auth-story">
          <span className="ftz-auth-pill">
            <i className="iconoir-shield-check" />
            Secure Administration
          </span>

          <h1>
            Control your crypto
            <span> ecosystem with precision.</span>
          </h1>

          <p>
            Secure access to users, permissions, platform operations,
            configuration and real-time insights.
          </p>

          <div className="ftz-auth-market-row" aria-label="Market preview">
            <div>
              <span className="ftz-auth-coin bitcoin">₿</span>
              <small>BTC/USDT</small>
              <strong>$67,452.21</strong>
              <b>+2.45%</b>
            </div>

            <div>
              <span className="ftz-auth-coin ethereum">Ξ</span>
              <small>ETH/USDT</small>
              <strong>$3,512.48</strong>
              <b>+2.18%</b>
            </div>

            <div>
              <span className="ftz-auth-coin solana">S</span>
              <small>SOL/USDT</small>
              <strong>$145.91</strong>
              <b>+4.12%</b>
            </div>
          </div>
        </div>

        <div className="ftz-auth-bull" aria-hidden="true" />

        <div className="ftz-auth-trust">
          <span>
            <i className="iconoir-lock" /> Protected sessions
          </span>
          <span>
            <i className="iconoir-shield-check" /> Permission controlled
          </span>
          <span>
            <i className="iconoir-fingerprint" /> Audit ready
          </span>
        </div>
      </section>

      <section className="ftz-auth-panel">
        <div className="ftz-auth-mobile-brand">
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone Admin Portal"
            width={190}
            height={50}
            priority
          />
        </div>

        <div className="ftz-login-card">
          <div className="ftz-login-head">
            <span>ADMIN PORTAL</span>
            <h2>Welcome back</h2>
            <p>
              Sign in to continue to the FixTradeZone control center.
              <br />
              New here?{" "}
              <a
                href="/register"
                style={{ color: "#19e6d3", fontWeight: 700 }}
              >
                Create an account
              </a>
              .
            </p>
          </div>

          <form onSubmit={handleSubmit} className="ftz-login-form">
            <label htmlFor="identifier">Account identifier</label>

            <div className="ftz-auth-input">
              <i className="iconoir-user" aria-hidden="true" />

              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                placeholder="Username, email or +mobile"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
                maxLength={191}
                disabled={isSubmitting}
              />
            </div>

            <div className="ftz-auth-label-row">
              <label htmlFor="password">Password</label>
              <small>Secure access</small>
            </div>

            <div className="ftz-auth-input">
              <i className="iconoir-lock" aria-hidden="true" />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={128}
                disabled={isSubmitting}
              />

              <button
                type="button"
                className="ftz-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                <i
                  className={
                    showPassword ? "iconoir-eye-closed" : "iconoir-eye"
                  }
                />
              </button>
            </div>

            {captchaLoading ? (
              <div className="ftz-captcha-loading">
                <i className="iconoir-refresh-double" />
                Loading security challenge…
              </div>
            ) : null}

            {captchaError ? (
              <div className="ftz-captcha-error">
                <span>{captchaError}</span>

                <button type="button" onClick={() => void loadCaptcha()}>
                  Retry
                </button>
              </div>
            ) : null}

            {captcha ? (
              <div className="ftz-captcha">
                <div className="ftz-captcha-head">
                  <div>
                    <strong>Security verification</strong>
                    <small>Challenge expires automatically</small>
                  </div>

                  <button
                    type="button"
                    title="New CAPTCHA"
                    aria-label="Generate new CAPTCHA"
                    disabled={isSubmitting || captchaLoading}
                    onClick={() => void loadCaptcha()}
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

                <label htmlFor="captchaAnswer">CAPTCHA answer</label>

                <div className="ftz-auth-input">
                  <i className="iconoir-key" aria-hidden="true" />

                  <input
                    id="captchaAnswer"
                    name="captchaAnswer"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Enter the result"
                    value={captchaAnswer}
                    onChange={(event) =>
                      setCaptchaAnswer(event.target.value.replace(/\D/g, ""))
                    }
                    required
                    maxLength={32}
                    disabled={isSubmitting}
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
              disabled={isSubmitting || captchaLoading || Boolean(captchaError)}
            >
              <span>{isSubmitting ? "Signing in…" : "Sign in securely"}</span>
              <i className="iconoir-arrow-right" />
            </button>
          </form>

          <div className="ftz-auth-security-note">
            <i className="iconoir-shield-check" />

            <div>
              <strong>Authorized administrators only</strong>
              <small>
                Access is protected by server-side authentication and role
                permissions.
              </small>
            </div>
          </div>
        </div>

        <p className="ftz-auth-footer">
          © 2026 FixTradeZone · Secure Administration
        </p>
      </section>
    </main>
  );
}
