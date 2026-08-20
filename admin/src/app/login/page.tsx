"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ErrorPayload {
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as ErrorPayload;

      if (!response.ok) {
        setError(payload.message ?? "Unable to sign in.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the admin service. Please try again.");
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
          <span><i className="iconoir-lock" /> Protected sessions</span>
          <span><i className="iconoir-shield-check" /> Permission controlled</span>
          <span><i className="iconoir-fingerprint" /> Audit ready</span>
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
            <p>Sign in to continue to the FixTradeZone control center.</p>
          </div>

          <form onSubmit={handleSubmit} className="ftz-login-form">
            <label htmlFor="email">Email address</label>
            <div className="ftz-auth-input">
              <i className="iconoir-mail" aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@fixtradezone.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.8 4.2A10.4 10.4 0 0 1 12 4c5.5 0 9.2 4.7 10 6.1a3.5 3.5 0 0 1 0 3.8 15 15 0 0 1-2.2 2.9M6.6 6.7A15 15 0 0 0 2 10.1a3.5 3.5 0 0 0 0 3.8C2.8 15.3 6.5 20 12 20a10 10 0 0 0 3.1-.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="2.7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                )}
              </button>
            </div>

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
              disabled={isSubmitting}
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

        <p className="ftz-auth-footer">© 2026 FixTradeZone · Secure Administration</p>
      </section>
    </main>
  );
}
