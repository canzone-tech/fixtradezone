"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

interface ApiPayload {
  message?: string;
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Password reset link is missing or invalid.");
      return;
    }

    if (password.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (!response.ok) {
        setError(payload.message ?? "Unable to reset password.");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(
        payload.message ??
          "Password reset successfully. Please sign in with your new password.",
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
            <i className="iconoir-key" /> Secure Password Reset
          </span>
          <h1>
            Set a new password
            <span> and invalidate old sessions.</span>
          </h1>
          <p>
            Reset links are single-use and time-limited. Successful completion
            revokes existing authenticated sessions for the account.
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
            <h2>Create a new password</h2>
            <p>Use at least 12 characters and do not reuse your current password.</p>
          </div>

          {!token ? (
            <div className="ftz-auth-security-note">
              <i className="iconoir-warning-triangle" />
              <div>
                <strong>Invalid reset link</strong>
                <small>
                  Request a new link from <Link href="/forgot-password">Forgot password</Link>.
                </small>
              </div>
            </div>
          ) : (
            <form className="ftz-login-form" onSubmit={submit}>
              <label htmlFor="newPassword">New password</label>
              <div className="ftz-auth-input">
                <i className="iconoir-lock" aria-hidden="true" />
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={submitting || Boolean(success)}
                />
                <button
                  type="button"
                  className="ftz-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <i className={showPassword ? "iconoir-eye-closed" : "iconoir-eye"} />
                </button>
              </div>

              <label htmlFor="confirmPassword">Confirm new password</label>
              <div className="ftz-auth-input">
                <i className="iconoir-lock" aria-hidden="true" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={submitting || Boolean(success)}
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
                    <strong>Password updated</strong>
                    <small>{success}</small>
                  </div>
                </div>
              ) : null}

              <button
                className="ftz-auth-submit"
                type="submit"
                disabled={submitting || Boolean(success)}
              >
                <span>{submitting ? "Updating…" : "Reset password"}</span>
                <i className="iconoir-arrow-right" />
              </button>
            </form>
          )}

          <div className="ftz-auth-security-note">
            <i className="iconoir-shield-check" />
            <div>
              <strong>Ready to sign in?</strong>
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
