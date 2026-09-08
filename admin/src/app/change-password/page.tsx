"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface ApiPayload {
  message?: string;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(payload.message ?? "Unable to change password.");
        return;
      }

      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch {
      setError("Password change service is unavailable. Please try again.");
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
            alt="FixTradeZone Secure Portal"
            width={200}
            height={53}
            priority
          />
        </div>
        <div className="ftz-auth-story">
          <span className="ftz-auth-pill">
            <i className="iconoir-key" /> Account Security
          </span>
          <h1>
            Change your password
            <span> and revoke existing sessions.</span>
          </h1>
          <p>
            Your current password is verified server-side. After a successful
            change, every active login session is revoked and you must sign in again.
          </p>
        </div>
        <div className="ftz-auth-bull" aria-hidden="true" />
      </section>

      <section className="ftz-auth-panel">
        <div className="ftz-auth-mobile-brand">
          <Image
            src="/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
            alt="FixTradeZone Secure Portal"
            width={190}
            height={50}
            priority
          />
        </div>

        <div className="ftz-login-card">
          <div className="ftz-login-head">
            <span>AUTHENTICATED SECURITY</span>
            <h2>Change password</h2>
            <p>Use at least 12 characters and do not reuse your current password.</p>
          </div>

          <form className="ftz-login-form" onSubmit={submit}>
            <label htmlFor="currentPassword">Current password</label>
            <div className="ftz-auth-input">
              <i className="iconoir-lock" aria-hidden="true" />
              <input
                id="currentPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                maxLength={128}
                required
                disabled={submitting}
              />
            </div>

            <label htmlFor="newPassword">New password</label>
            <div className="ftz-auth-input">
              <i className="iconoir-key" aria-hidden="true" />
              <input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className="ftz-password-toggle"
                aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                onClick={() => setShowPassword((current) => !current)}
              >
                <i className={showPassword ? "iconoir-eye-closed" : "iconoir-eye"} />
              </button>
            </div>

            <label htmlFor="confirmPassword">Confirm new password</label>
            <div className="ftz-auth-input">
              <i className="iconoir-key" aria-hidden="true" />
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                required
                disabled={submitting}
              />
            </div>

            <div
              className={`ftz-auth-error ${error ? "is-visible" : ""}`}
              role="alert"
              aria-live="polite"
            >
              {error || " "}
            </div>

            <button className="ftz-auth-submit" type="submit" disabled={submitting}>
              <span>{submitting ? "Changing…" : "Change password"}</span>
              <i className="iconoir-arrow-right" />
            </button>
          </form>

          <div className="ftz-auth-security-note">
            <i className="iconoir-shield-check" />
            <div>
              <strong>Session revocation is automatic</strong>
              <small>Successful password changes require a fresh sign in on every device.</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
