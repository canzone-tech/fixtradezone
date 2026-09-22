"use client";

import { useEffect, useId, useState } from "react";

interface ErrorPayload {
  message?: string;
  verificationLinkTtlSeconds?: number;
}

interface EmailVerificationResendProps {
  defaultEmail?: string;
  canResend?: boolean;
  initialExpiresIn?: number;
  verificationTtlSeconds?: number;
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

function formatRemaining(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function EmailVerificationResend({
  defaultEmail = "",
  canResend = true,
  initialExpiresIn = 0,
  verificationTtlSeconds = 30 * 60,
}: EmailVerificationResendProps) {
  const inputId = useId();
  const [email, setEmail] = useState(defaultEmail.trim());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(
    canResend ? 0 : Math.max(1, Math.floor(initialExpiresIn)),
  );

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  async function resendVerification() {
    const normalizedEmail = email.trim();

    setMessage("");
    setError("");

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter the email address used to register your account.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/auth/email-verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ErrorPayload
        | null;

      if (!response.ok) {
        throw new Error(
          readMessage(payload, "Unable to resend verification email."),
        );
      }

      setMessage(
        readMessage(
          payload,
          "If the account is eligible, a verification email has been sent.",
        ),
      );
      const nextTtl =
        typeof payload?.verificationLinkTtlSeconds === "number" &&
        Number.isFinite(payload.verificationLinkTtlSeconds)
          ? payload.verificationLinkTtlSeconds
          : verificationTtlSeconds;
      setRemainingSeconds(Math.max(1, Math.floor(nextTtl)));
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to resend verification email right now.",
      );
    } finally {
      setSending(false);
    }
  }

  if (remainingSeconds > 0) {
    return (
      <div
        style={{ display: "grid", gap: 10, padding: "8px 0 4px" }}
        aria-live="polite"
      >
        <div className="ftz-register-state">
          <i className="iconoir-mail" aria-hidden="true" />
          <div>
            <strong>Check your email for verification.</strong>
            <span>
              Current verification link expires in{" "}
              <b>{formatRemaining(remainingSeconds)}</b>.
            </span>
          </div>
        </div>
        {message ? <small>{message}</small> : null}
      </div>
    );
  }

  return (
    <div
      style={{ display: "grid", gap: 12, padding: "8px 0 4px" }}
      aria-live="polite"
    >
      <div className="ftz-register-state is-warning">
        <i className="iconoir-warning-triangle" aria-hidden="true" />
        <div>
          <strong>Verification link expired</strong>
          <span>Request a fresh verification email to continue.</span>
        </div>
      </div>

      <div className="ftz-auth-label-row">
        <label htmlFor={inputId}>Verification email</label>
        <small>Request a fresh verification link</small>
      </div>

      <div className="ftz-auth-input">
        <i className="iconoir-mail" aria-hidden="true" />
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={191}
          disabled={sending}
        />
      </div>

      <button
        className="ftz-auth-submit"
        type="button"
        onClick={() => void resendVerification()}
        disabled={sending}
      >
        <span>{sending ? "Sending…" : "Resend verification email"}</span>
        <i className="iconoir-mail" aria-hidden="true" />
      </button>

      {error ? (
        <div className="ftz-auth-error is-visible" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
