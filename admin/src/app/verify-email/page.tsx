"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./verify-email.module.css";

interface VerifyResult {
  message: string;
  status?: string;
  emailVerifiedAt?: string;
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

export default function VerifyEmailPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const token = new URLSearchParams(window.location.search).get("token")?.trim();

    if (!token) {
      setError("Email verification token is missing.");
      setLoading(false);
      return;
    }

    void fetch("/api/auth/email-verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(readMessage(payload, "Unable to verify email."));
        }

        if (!cancelled) {
          setResult(payload as VerifyResult);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Unable to verify email.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
            <i className="iconoir-mail" /> Email Verification
          </span>
          <h1>
            Secure your<span> FixTradeZone account.</span>
          </h1>
          <p>Email verification activates newly registered user access.</p>
        </div>
      </section>

      <section className="ftz-auth-panel">
        <div className="ftz-login-card">
          <div className="ftz-login-head">
            <span>ACCOUNT VERIFICATION</span>
            <h2>Verify email</h2>
          </div>

          <div className={styles.cardBody} aria-live="polite">
            {loading ? (
              <div className="ftz-register-state">
                <i className="iconoir-refresh-double" /> Verifying your email…
              </div>
            ) : null}

            {!loading && result ? (
              <div className={styles.statusBox}>
                <strong>{result.message}</strong>
                {result.status ? <span>Account status: {result.status}</span> : null}
                <span>You can now continue to sign in when the account is active.</span>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="ftz-auth-error is-visible" role="alert">
                {error}
              </div>
            ) : null}

            <div className={styles.actions}>
              <Link className="ftz-auth-submit" href="/login">
                <span>Continue to sign in</span>
                <i className="iconoir-arrow-right" />
              </Link>
              {!result ? <Link href="/register">Back to registration</Link> : null}
            </div>
          </div>
        </div>

        <p className="ftz-auth-footer">© 2026 FixTradeZone · Email Verification</p>
      </section>
    </main>
  );
}
