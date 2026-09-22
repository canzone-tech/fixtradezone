"use client";

import { useId, useState } from "react";

interface ErrorPayload {
  message?: string;
}

interface EmailVerificationResendProps {
  defaultEmail?: string;
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

export default function EmailVerificationResend({
  defaultEmail = "",
}: EmailVerificationResendProps) {
  const inputId = useId();
  const [email, setEmail] = useState(defaultEmail.trim());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div
      style={{ display: "grid", gap: 12, padding: "8px 0 4px" }}
      aria-live="polite"
    >
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

      {message ? (
        <div className="ftz-register-state">
          <i className="iconoir-check-circle" aria-hidden="true" /> {message}
        </div>
      ) : null}

      {error ? (
        <div className="ftz-auth-error is-visible" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
