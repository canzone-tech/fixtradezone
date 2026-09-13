"use client";

import { useEffect, useState, type FormEvent } from "react";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";

interface EmailStatus {
  mode: "CONSOLE" | "HTTP" | "SMTP";
  configured: boolean;
  fromEmail?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    requireTls: boolean;
    rejectUnauthorized: boolean;
    authenticationConfigured: boolean;
  };
  message?: string;
}

interface TestResult {
  message?: string;
  transport?: "CONSOLE" | "HTTP" | "SMTP";
  accepted?: boolean;
}

function smtpEncryption(status: EmailStatus): string {
  if (status.mode !== "SMTP" || !status.smtp) return "—";
  if (status.smtp.secure) return "Implicit TLS";
  if (status.smtp.requireTls) return "STARTTLS required";
  return "Plain SMTP";
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
    const timeoutId = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
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

      const transport = payload.transport ?? status?.mode;
      setSuccess(
        transport === "CONSOLE"
          ? "Test message generated successfully in CONSOLE mode. No external email was sent."
          : `${payload.message ?? "Test email accepted by the configured transport."} Check the recipient inbox or spam folder for final delivery.`,
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
          Read the safe transport state and send a controlled delivery test. SMTP
          credentials remain server-side and are never returned to this page.
        </p>
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Transport Status</p>
        <h2>Runtime email configuration</h2>

        {loading ? (
          <div className={styles.empty}>Loading email transport status…</div>
        ) : status ? (
          <>
            <div className={styles.grid}>
              <div className={styles.metric}>
                <small>Mode</small>
                <strong>{status.mode}</strong>
              </div>
              <div className={styles.metric}>
                <small>Configuration</small>
                <strong>
                  <span className="ftz-status-chip">
                    {status.configured ? "READY" : "INCOMPLETE"}
                  </span>
                </strong>
              </div>
              {status.fromEmail ? (
                <div className={styles.metric}>
                  <small>Sender</small>
                  <strong>{status.fromEmail}</strong>
                </div>
              ) : null}
              {status.mode === "SMTP" && status.smtp ? (
                <>
                  <div className={styles.metric}>
                    <small>SMTP endpoint</small>
                    <strong>
                      {status.smtp.host}:{status.smtp.port}
                    </strong>
                  </div>
                  <div className={styles.metric}>
                    <small>Encryption</small>
                    <strong>{smtpEncryption(status)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <small>TLS certificate verification</small>
                    <strong>
                      {status.smtp.rejectUnauthorized ? "ENFORCED" : "DISABLED"}
                    </strong>
                  </div>
                  <div className={styles.metric}>
                    <small>SMTP authentication</small>
                    <strong>
                      {status.smtp.authenticationConfigured
                        ? "CONFIGURED"
                        : "NOT CONFIGURED"}
                    </strong>
                  </div>
                </>
              ) : null}
            </div>
            {status.mode === "CONSOLE" ? (
              <div className="ftz-console-warning" role="status">
                <i className="iconoir-warning-triangle" />
                CONSOLE MODE — delivery is captured locally; no external inbox email
                is sent.
              </div>
            ) : null}
            {status.mode === "SMTP" && !status.configured ? (
              <div className="ftz-console-warning" role="status">
                <i className="iconoir-warning-triangle" />
                SMTP MODE is selected but the server-side configuration is incomplete.
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.empty}>Email status is unavailable.</div>
        )}
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Delivery Test</p>
        <h2>Send one test message</h2>
        <p>
          Use an address you control. A successful response means the configured
          transport accepted the message; final inbox delivery still depends on the
          SMTP/provider and recipient mail system.
        </p>

        <form className={styles.formGrid} onSubmit={sendTest}>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label htmlFor="email-test-recipient">Recipient email</label>
            <input
              id="email-test-recipient"
              className={styles.input}
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              maxLength={191}
              required
              disabled={sending || !status?.configured}
              placeholder="qa@example.com"
            />
          </div>

          <div className={`${styles.actions} ${styles.fieldFull}`}>
            <button
              type="submit"
              className={styles.button}
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
        <p className={styles.eyebrow}>SMTP Activation</p>
        <h2>Production transport is environment-managed</h2>
        <p>
          Set <code>COMMUNICATION_EMAIL_MODE=SMTP</code> together with SMTP host,
          port, TLS mode, sender address and provider credentials in the backend
          environment. Restart the backend, verify READY above, then send one
          controlled test to an inbox you own.
        </p>
        <p>
          Recommended provider pattern: port 587 with STARTTLS required, or port 465
          with implicit TLS. Certificate verification must remain enabled in
          production.
        </p>
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Security Boundary</p>
        <h2>SMTP secrets never enter the browser</h2>
        <p>
          The page may display non-secret sender, host, port and TLS readiness.
          SMTP username/password or provider tokens are intentionally never returned,
          editable or readable from the browser.
        </p>
      </section>
    </div>
  );
}
