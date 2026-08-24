"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ErrorPayload {
  message?: string;
}

export default function ChangeRequiredPasswordPage() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("New password must contain between 12 and 128 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-required-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ErrorPayload;

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        setError(payload.message ?? "Unable to change password.");
        return;
      }

      setSuccess(
        payload.message ?? "Password changed successfully. Sign in again.",
      );

      setNewPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch {
      setError("Unable to reach the authentication service.");
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
            <i className="iconoir-lock" />
            Credential Protection
          </span>

          <h1>
            Secure your account
            <span> before continuing.</span>
          </h1>

          <p>
            Temporary credentials are never promoted into a normal session.
            Create your private password before accessing the platform.
          </p>
        </div>

        <div className="ftz-auth-bull" aria-hidden="true" />

        <div className="ftz-auth-trust">
          <span>
            <i className="iconoir-key" /> One-purpose credential flow
          </span>
          <span>
            <i className="iconoir-shield-check" /> Session protected
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
            <span>SECURITY REQUIRED</span>
            <h2>Create your password</h2>
            <p>
              Replace the temporary password before starting an authenticated
              session.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="ftz-login-form">
            <label htmlFor="newPassword">New password</label>

            <div className="ftz-auth-input">
              <i className="iconoir-lock" aria-hidden="true" />

              <input
                id="newPassword"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Minimum 12 characters"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
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

            <div className="ftz-auth-label-row">
              <label htmlFor="confirmPassword">Confirm password</label>
              <small>12–128 characters</small>
            </div>

            <div className="ftz-auth-input">
              <i className="iconoir-key" aria-hidden="true" />

              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
                disabled={isSubmitting}
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
              <div className="ftz-auth-success" role="status">
                <i className="iconoir-check-circle" />
                {success}
              </div>
            ) : null}

            <button
              className="ftz-auth-submit"
              type="submit"
              disabled={isSubmitting || Boolean(success)}
            >
              <span>
                {isSubmitting ? "Updating password…" : "Set secure password"}
              </span>

              <i className="iconoir-arrow-right" />
            </button>
          </form>

          <div className="ftz-auth-security-note">
            <i className="iconoir-shield-check" />

            <div>
              <strong>No authenticated session exists yet</strong>
              <small>
                After changing the password, you will sign in again normally.
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
