"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ErrorPayload {
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="login-page">
      <section className="login-story" aria-label="FixTradeZone operations">
        <div className="brand brand-on-dark">
          <span className="brand-mark" aria-hidden="true">
            FT
          </span>
          <span>
            <strong>FixTradeZone</strong>
            <small>Operations Console</small>
          </span>
        </div>

        <div className="story-copy">
          <span className="eyebrow eyebrow-light">CONTROL WITH CLARITY</span>
          <h1>One secure place to run the platform.</h1>
          <p>
            Review users, approvals, packages and platform activity from a
            focused operations workspace.
          </p>
        </div>

        <div className="security-note">
          <span className="security-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>Protected session</strong>
            <small>Short-lived access with rotating refresh tokens</small>
          </span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand brand">
            <span className="brand-mark" aria-hidden="true">
              FT
            </span>
            <span>
              <strong>FixTradeZone</strong>
              <small>Operations Console</small>
            </span>
          </div>

          <span className="eyebrow">ADMIN ACCESS</span>
          <h2>Welcome back</h2>
          <p className="form-intro">
            Sign in with an active administrator account.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <span aria-hidden="true">@</span>
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

            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <span aria-hidden="true">●</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={128}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-error" role="alert" aria-live="polite">
              {error}
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in securely"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="support-copy">
            Access is restricted to authorized FixTradeZone administrators.
          </p>
        </div>
      </section>
    </main>
  );
}
