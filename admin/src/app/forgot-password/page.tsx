"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

interface ApiPayload {
  message?: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (!response.ok) {
        setError(payload.message ?? "Unable to request password reset.");
        return;
      }

      setSuccess(
        payload.message ??
          "If the account is eligible, a password reset email has been sent.",
      );
    } catch {
      setError("Password recovery service is unavailable. Please try again.");
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
            <i className="iconoir-lock" /> Secure Account Recovery
          </span>
          <h1>
            Recover access
            <span> without exposing your account.</span>
          </h1>
          <p>
            Reset links are single-use, expire automatically, and successful
            resets revoke existing authenticated sessions.
          </p>
        </div>
        <div className="ftz-auth-bull" aria-hidden="true" />
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

        <div className="ftz-login-card">
          <div className="ftz-login-head">
            <span>ACCOUNT RECOVERY</span>
            <h2>Forgot your password?</h2>
            <p>
              Enter the verified email address associated with your account.
              For privacy, the response is the same whether an eligible account
              exists or not.
            </p>
          </div>

          <form className="ftz-login-form" onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <div className="ftz-auth-input">
              <i className="iconoir-mail" aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={191}
                required
                disabled={submitting}
                placeholder="you@example.com"
              />
            </div>

            <div
              className={`ftz-auth-error ${error ? "is-visible" : ""}`}
              role="alert"
              aria-live="polite"
            >
              {error || " "}
            </div>

            {success ? (
              <div className="ftz-auth-security-note" role="status">
                <i className="iconoir-check-circle" />
                <div>
                  <strong>Request received</strong>
                  <small>{success}</small>
                </div>
              </div>
            ) : null}

            <button
              className="ftz-auth-submit"
              type="submit"
              disabled={submitting}
            >
              <span>{submitting ? "Submitting…" : "Send reset link"}</span>
              <i className="iconoir-arrow-right" />
            </button>
          </form>

          <div className="ftz-auth-security-note">
            <i className="iconoir-shield-check" />
            <div>
              <strong>Remembered your password?</strong>
              <small>
                <Link href="/login">Return to secure sign in</Link>
              </small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
