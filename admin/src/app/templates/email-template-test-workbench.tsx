"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveAdminSession } from "@/lib/admin-session-client";
import styles from "./templates.module.css";

type EmailTemplateContent = {
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  ctaLabel: string;
  footer: string;
};

type EmailWorkspace = {
  contentKey: string;
  templateKey: string;
  effective: EmailTemplateContent;
  effectiveSource: "DEFAULT" | "PUBLISHED_REVISION";
  allowedVariables: string[];
};

type MessagePayload = {
  message?: string | string[];
  transport?: "CONSOLE" | "HTTP" | "SMTP";
  accepted?: boolean;
};

const TEMPLATE_META: Record<
  string,
  { label: string; category: string; description: string }
> = {
  EMAIL_VERIFICATION: {
    label: "Email verification",
    category: "AUTH",
    description: "Secure account verification with a short-lived action link.",
  },
  PASSWORD_RESET: {
    label: "Password reset",
    category: "AUTH",
    description: "Secure password recovery with a one-time action link.",
  },
  WELCOME: {
    label: "Welcome / signup",
    category: "AUTH",
    description: "Welcome content for a newly ready FixTradeZone account.",
  },
  MARKETING_OFFER: {
    label: "Marketing offer",
    category: "MARKETING",
    description: "Promotional content for eligible, preference-compliant recipients.",
  },
  DELIVERY_TEST: {
    label: "Delivery diagnostic",
    category: "SYSTEM",
    description: "Controlled transport diagnostic content.",
  },
};

function sampleValues(contentKey: string): Record<string, string> {
  const appUrl = "https://app.fixtradezone.example";
  switch (contentKey) {
    case "EMAIL_VERIFICATION":
      return {
        displayName: "FixTradeZone Test User",
        verificationUrl: `${appUrl}/verify-email?token=CONTROLLED_TEST_ONLY`,
        expiresInMinutes: "30",
      };
    case "PASSWORD_RESET":
      return {
        displayName: "FixTradeZone Test User",
        resetUrl: `${appUrl}/reset-password?token=CONTROLLED_TEST_ONLY`,
        expiresInMinutes: "30",
      };
    case "WELCOME":
      return {
        displayName: "FixTradeZone Test User",
        userCode: "100000",
        appUrl,
      };
    case "MARKETING_OFFER":
      return {
        displayName: "FixTradeZone Test User",
        offerTitle: "FixTradeZone Test Offer",
        offerSummary:
          "This is controlled preview content and is not a live promotion.",
        offerUrl: `${appUrl}/user/packages`,
        unsubscribeUrl: `${appUrl}/user/profile`,
      };
    case "DELIVERY_TEST":
      return { requestedBy: "SUPER_ADMIN", appUrl };
    default:
      return {};
  }
}

function interpolate(value: string, values: Record<string, string>): string {
  return value.replace(
    /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g,
    (_match, variable: string) => values[variable] ?? "",
  );
}

function messageFrom(payload: MessagePayload | null, fallback: string): string {
  if (!payload?.message) return fallback;
  return typeof payload.message === "string"
    ? payload.message
    : (payload.message[0] ?? fallback);
}

export default function EmailTemplateTestWorkbench() {
  const [enabled, setEnabled] = useState(false);
  const [workspaces, setWorkspaces] = useState<EmailWorkspace[]>([]);
  const [contentKey, setContentKey] = useState("WELCOME");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const session = await resolveAdminSession();
      if (!active || !session.user) return;

      const superAdmin = session.user.roles.includes("SUPER_ADMIN");
      setEnabled(superAdmin);
      if (!superAdmin) return;

      const response = await fetch("/api/admin/content/email-templates", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | EmailWorkspace[]
        | null;

      if (!response.ok || !payload) {
        if (active) setError("Unable to load email templates for preview.");
        return;
      }

      if (active) {
        setWorkspaces(payload);
        setContentKey(
          payload.find((item) => item.contentKey === "WELCOME")?.contentKey ??
            payload[0]?.contentKey ??
            "",
        );
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => workspaces.find((item) => item.contentKey === contentKey) ?? null,
    [contentKey, workspaces],
  );

  const preview = useMemo(() => {
    if (!selected) return null;
    const values = sampleValues(selected.contentKey);
    return Object.fromEntries(
      Object.entries(selected.effective).map(([key, value]) => [
        key,
        interpolate(value, values),
      ]),
    ) as EmailTemplateContent;
  }, [selected]);

  async function sendTest() {
    const template = selected;
    if (!template) return;

    if (!recipient.trim()) {
      setError("Enter a recipient email address you control.");
      return;
    }

    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/communication/email/templates/${encodeURIComponent(template.contentKey)}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient,
            content: template.effective,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | MessagePayload
        | null;

      if (!response.ok) {
        throw new Error(messageFrom(payload, "Template test delivery failed."));
      }

      setNotice(
        `${messageFrom(payload, "Template test accepted.")} Transport: ${payload?.transport ?? "UNKNOWN"}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Template test delivery failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || !selected || !preview) return null;

  const meta = TEMPLATE_META[selected.contentKey] ?? {
    label: selected.contentKey,
    category: "SYSTEM",
    description: "Managed FixTradeZone email content.",
  };

  return (
    <section className={styles.workspace} aria-label="Email template preview and test">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>EMAIL TEMPLATE ACCEPTANCE</span>
          <h1>Preview & controlled test</h1>
          <p>
            Preview the current effective template with safe sample values, then send
            one controlled message through the configured transport. SMTP secrets
            remain server-side.
          </p>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <div className={styles.columns}>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>{meta.category} TEMPLATE</span>
              <h2>{meta.label}</h2>
            </div>
            <select
              value={contentKey}
              onChange={(event) => {
                setContentKey(event.target.value);
                setNotice("");
                setError("");
              }}
            >
              {workspaces.map((item) => (
                <option value={item.contentKey} key={item.contentKey}>
                  {TEMPLATE_META[item.contentKey]?.label ?? item.contentKey}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.safeNote}>
            {meta.description} Source: {selected.effectiveSource}. Test delivery uses
            safe sample variables only and does not create a campaign or account action.
          </div>

          <div className={styles.subheading}>Rendered preview</div>
          <div className={styles.revisions}>
            <article className={styles.revision}>
              <strong>{preview.subject}</strong>
              <small>{preview.preheader}</small>
              <div>{preview.headline}</div>
              <div>{preview.body}</div>
              <small>CTA: {preview.ctaLabel}</small>
              <small>{preview.footer}</small>
            </article>
          </div>

          <div className={styles.variables}>
            <span>Allowed variables:</span>
            {selected.allowedVariables.map((variable) => (
              <code key={variable}>{`{{${variable}}}`}</code>
            ))}
          </div>

          <label className={styles.wideField}>
            <span>Controlled test recipient</span>
            <input
              type="email"
              maxLength={191}
              autoComplete="off"
              placeholder="you@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </label>

          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => void sendTest()}>
              {busy ? "Sending…" : "Send controlled template test"}
            </button>
          </div>
        </div>

        <aside className={styles.history}>
          <div className={styles.panelHeading}>
            <div>
              <span>DELIVERY BOUNDARY</span>
              <h2>Safe test rules</h2>
            </div>
          </div>
          <div className={styles.revisions}>
            <article className={styles.revision}>
              <strong>No live campaign</strong>
              <small>Exactly one address entered above receives the test.</small>
            </article>
            <article className={styles.revision}>
              <strong>No real security token</strong>
              <small>
                Verification and reset previews use CONTROLLED_TEST_ONLY placeholders.
              </small>
            </article>
            <article className={styles.revision}>
              <strong>Transport-aware</strong>
              <small>
                CONSOLE remains local-only. SMTP/HTTP sends only when explicitly
                configured server-side.
              </small>
            </article>
          </div>
        </aside>
      </div>
    </section>
  );
}
