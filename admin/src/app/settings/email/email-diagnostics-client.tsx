"use client";

import { useEffect, useState, type FormEvent } from "react";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";

interface EmailStatus {
  mode: "CONSOLE" | "HTTP" | "SMTP";
  configured: boolean;
  message?: string;
}

interface TestResult {
  message?: string;
  transport?: "CONSOLE" | "HTTP" | "SMTP";
  accepted?: boolean;
}

export default function EmailDiagnosticsClient() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/communication/email/status", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as EmailStatus;

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to load email transport status.");
      }

      setStatus(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load email transport status.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/communication/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as TestResult;

      if (!response.ok) {
        throw new Error(payload.message ?? "Test email failed.");
      }

      setSuccess(
        `${payload.message ?? "Test email accepted."}${payload.transport ? ` Transport: ${payload.transport}.` : ""}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Test email failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      {error ? (
        <FlashMessage message={error} type="error" onClose={() => setError(null)} />
      ) : null}
      {success ? (
        <FlashMessage
          message={success}
          type="success"
          onClose={() => setSuccess(null)}
        />
      ) : null}

      <section className={styles.hero}>
        <p className={styles.eyebrow}>COMMUNICATION / SUPERADMIN</p>
        <h1>Email Delivery</h1>
        <p>
          Read the safe transport state and send a controlled delivery test.
          SMTP credentials remain server-side and are never returned to this page.
        </p>
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Transport Status</p>
        <h2>Runtime email configuration</h2>

        {loading ? (
          <div className={styles.empty}>Loading email transport status…</div>
        ) : status ? (
          <div className={styles.grid}>
            <div className={styles.metric}>
              <small>Mode</small>
              <strong>{status.mode}</strong>
            </div>
            <div className={styles.metric}>
              <small>Configuration</small>
              <strong>{status.configured ? "READY" : "INCOMPLETE"}</strong>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>Email status is unavailable.</div>
        )}
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Delivery Test</p>
        <h2>Send one test message</h2>
        <p>
          Use an address you control. A successful response means the configured
          transport accepted the message; final inbox delivery still depends on
          the SMTP/provider and recipient mail system.
        </p>

        <form className={styles.form} onSubmit={sendTest}>
          <label>
            Recipient email
            <input
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              maxLength={191}
              required
              disabled={sending || !status?.configured}
              placeholder="qa@example.com"
            />
          </label>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.buttonPrimary}
              disabled={sending || !status?.configured}
            >
              {sending ? "Sending…" : "Send test email"}
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={loading}
              onClick={() => void loadStatus()}
            >
              Refresh status
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Security Boundary</p>
        <h2>Credentials are environment-managed</h2>
        <p>
          Host, username, password and TLS settings are intentionally not editable
          or readable from the browser. Configure them in the backend environment,
          restart the service, then verify here.
        </p>
      </section>
    </div>
  );
}
