"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import styles from "./templates.module.css";

type RevisionStatus = "DRAFT" | "PUBLISHED";

interface LandingFeatureContent {
  title: string;
  description: string;
}

interface LandingContent {
  brandName: string;
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  features: LandingFeatureContent[];
  trustTitle: string;
  trustDescription: string;
  disclosure: string;
  footerText: string;
  seoTitle: string;
  seoDescription: string;
}

interface EmailTemplateContent {
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  ctaLabel: string;
  footer: string;
}

interface ContentRevision<T> {
  id: string;
  contentKey: string;
  version: number;
  status: RevisionStatus;
  templateKey: string;
  payload: T;
  createdByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface ContentWorkspace<T> {
  contentKey: string;
  templateKey: string;
  effective: T;
  effectiveSource: "DEFAULT" | "PUBLISHED_REVISION";
  publishedRevision: ContentRevision<T> | null;
  revisions: ContentRevision<T>[];
}

interface EmailWorkspace extends ContentWorkspace<EmailTemplateContent> {
  allowedVariables: string[];
}

interface ApiPayload {
  message?: string | string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function apiMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const message = (payload as ApiPayload).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message[0] ?? fallback;
  return fallback;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function can(user: AdminUser | null, permission: string): boolean {
  return Boolean(
    user &&
      (user.roles.includes("SUPER_ADMIN") ||
        user.permissions.includes(permission)),
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Not published";
  return new Date(value).toLocaleString();
}

export default function ContentManagementClient() {
  const router = useRouter();
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [landing, setLanding] = useState<ContentWorkspace<LandingContent> | null>(null);
  const [landingForm, setLandingForm] = useState<LandingContent | null>(null);
  const [emails, setEmails] = useState<EmailWorkspace[]>([]);
  const [selectedEmailKey, setSelectedEmailKey] = useState("");
  const [emailForm, setEmailForm] = useState<EmailTemplateContent | null>(null);
  const [tab, setTab] = useState<"landing" | "email">("landing");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedEmail = useMemo(
    () => emails.find((item) => item.contentKey === selectedEmailKey) ?? null,
    [emails, selectedEmailKey],
  );

  const canRead = can(actor, "content.read");
  const canManage = can(actor, "content.manage");
  const canPublish = can(actor, "content.publish");

  async function fetchWorkspace() {
    const [landingResponse, emailResponse] = await Promise.all([
      fetch("/api/admin/content/landing", { cache: "no-store" }),
      fetch("/api/admin/content/email-templates", { cache: "no-store" }),
    ]);

    if (landingResponse.status === 401 || emailResponse.status === 401) {
      router.replace("/login");
      throw new Error("Session expired.");
    }

    const landingPayload =
      await readPayload<ContentWorkspace<LandingContent>>(landingResponse);
    const emailPayload = await readPayload<EmailWorkspace[]>(emailResponse);

    if (!landingResponse.ok || !landingPayload) {
      throw new Error(
        apiMessage(landingPayload, "Unable to load landing content workspace."),
      );
    }

    if (!emailResponse.ok || !emailPayload) {
      throw new Error(
        apiMessage(emailPayload, "Unable to load email template workspace."),
      );
    }

    setLanding(landingPayload);
    setLandingForm(clone(landingPayload.effective));
    setEmails(emailPayload);

    const nextKey =
      emailPayload.find((item) => item.contentKey === selectedEmailKey)?.contentKey ??
      emailPayload[0]?.contentKey ??
      "";
    setSelectedEmailKey(nextKey);
    const nextEmail = emailPayload.find((item) => item.contentKey === nextKey);
    setEmailForm(nextEmail ? clone(nextEmail.effective) : null);
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const session = await resolveAdminSession();

        if (!session.user) {
          if (session.status === 401 || session.status === 403) {
            router.replace("/login");
            return;
          }
          throw new Error(session.message || "Unable to load administrator session.");
        }

        if (!mounted) return;
        setActor(session.user);

        if (
          !session.user.roles.includes("SUPER_ADMIN") &&
          !session.user.permissions.includes("content.read")
        ) {
          return;
        }

        await fetchWorkspace();
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Templates / CMS.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
    // Session-first bootstrap is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function post(url: string, body?: unknown): Promise<boolean> {
    setBusy(url);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await readPayload<ApiPayload>(response);

      if (response.status === 401) {
        router.replace("/login");
        return false;
      }

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Content request failed."));
      }

      setSuccess(apiMessage(payload, "Content updated."));
      await fetchWorkspace();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Content request failed.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createLandingDraft(event: FormEvent) {
    event.preventDefault();
    if (!landingForm || !canManage) return;
    await post("/api/admin/content/landing/drafts", landingForm);
  }

  async function publishLanding(revision: ContentRevision<LandingContent>) {
    if (!canPublish) return;
    await post(
      `/api/admin/content/landing/${encodeURIComponent(revision.id)}/publish`,
    );
  }

  async function createEmailDraft(event: FormEvent) {
    event.preventDefault();
    if (!selectedEmail || !emailForm || !canManage) return;

    await post(
      `/api/admin/content/email-templates/${encodeURIComponent(
        selectedEmail.contentKey,
      )}/drafts`,
      emailForm,
    );
  }

  async function publishEmail(revision: ContentRevision<EmailTemplateContent>) {
    if (!selectedEmail || !canPublish) return;

    await post(
      `/api/admin/content/email-templates/${encodeURIComponent(
        selectedEmail.contentKey,
      )}/${encodeURIComponent(revision.id)}/publish`,
    );
  }

  function chooseEmail(contentKey: string) {
    const next = emails.find((item) => item.contentKey === contentKey);
    setSelectedEmailKey(contentKey);
    setEmailForm(next ? clone(next.effective) : null);
    setError("");
    setSuccess("");
  }

  if (loading) {
    return <div className={styles.state}>Loading Templates / CMS…</div>;
  }

  if (!actor || !canRead) {
    return (
      <div className={styles.state}>
        Your administrator role does not include <code>content.read</code>.
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CONTENT OPERATIONS</span>
          <h1>Templates / CMS</h1>
          <p>
            Structured, versioned content only. Published revisions are immutable;
            rollback repoints the live publication without editing history.
          </p>
        </div>
        <div className={styles.permissionGrid}>
          <span className={canRead ? styles.allowed : styles.denied}>Read</span>
          <span className={canManage ? styles.allowed : styles.denied}>Draft</span>
          <span className={canPublish ? styles.allowed : styles.denied}>Publish</span>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "landing" ? styles.activeTab : ""}
          onClick={() => setTab("landing")}
        >
          Public Landing
        </button>
        <button
          type="button"
          className={tab === "email" ? styles.activeTab : ""}
          onClick={() => setTab("email")}
        >
          Email Templates
        </button>
      </div>

      {tab === "landing" && landing && landingForm ? (
        <div className={styles.columns}>
          <form className={styles.panel} onSubmit={createLandingDraft}>
            <div className={styles.panelHeading}>
              <div>
                <span>LANDING CONTENT</span>
                <h2>{landing.templateKey}</h2>
              </div>
              <span className={styles.source}>{landing.effectiveSource}</span>
            </div>

            <div className={styles.formGrid}>
              <Field label="Brand name">
                <input
                  value={landingForm.brandName}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, brandName: e.target.value })
                  }
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="Badge">
                <input
                  value={landingForm.badge}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, badge: e.target.value })
                  }
                  maxLength={100}
                  required
                />
              </Field>
              <Field label="Hero title" wide>
                <input
                  value={landingForm.heroTitle}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, heroTitle: e.target.value })
                  }
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Hero accent" wide>
                <input
                  value={landingForm.heroAccent}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, heroAccent: e.target.value })
                  }
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Hero description" wide>
                <textarea
                  value={landingForm.heroDescription}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      heroDescription: e.target.value,
                    })
                  }
                  maxLength={800}
                  rows={4}
                  required
                />
              </Field>
              <Field label="Primary CTA label">
                <input
                  value={landingForm.primaryCtaLabel}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      primaryCtaLabel: e.target.value,
                    })
                  }
                  maxLength={60}
                  required
                />
              </Field>
              <Field label="Primary CTA path / HTTPS URL">
                <input
                  value={landingForm.primaryCtaHref}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      primaryCtaHref: e.target.value,
                    })
                  }
                  maxLength={300}
                  required
                />
              </Field>
              <Field label="Secondary CTA label">
                <input
                  value={landingForm.secondaryCtaLabel}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      secondaryCtaLabel: e.target.value,
                    })
                  }
                  maxLength={60}
                  required
                />
              </Field>
              <Field label="Secondary CTA path / HTTPS URL">
                <input
                  value={landingForm.secondaryCtaHref}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      secondaryCtaHref: e.target.value,
                    })
                  }
                  maxLength={300}
                  required
                />
              </Field>
            </div>

            <div className={styles.subheading}>Feature cards</div>
            <div className={styles.featureEditors}>
              {landingForm.features.map((feature, index) => (
                <div className={styles.featureEditor} key={index}>
                  <input
                    aria-label={`Feature ${index + 1} title`}
                    value={feature.title}
                    maxLength={80}
                    required
                    onChange={(e) => {
                      const features = clone(landingForm.features);
                      features[index].title = e.target.value;
                      setLandingForm({ ...landingForm, features });
                    }}
                  />
                  <textarea
                    aria-label={`Feature ${index + 1} description`}
                    value={feature.description}
                    maxLength={320}
                    rows={3}
                    required
                    onChange={(e) => {
                      const features = clone(landingForm.features);
                      features[index].description = e.target.value;
                      setLandingForm({ ...landingForm, features });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className={styles.formGrid}>
              <Field label="Trust title" wide>
                <input
                  value={landingForm.trustTitle}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, trustTitle: e.target.value })
                  }
                  maxLength={160}
                  required
                />
              </Field>
              <Field label="Trust description" wide>
                <textarea
                  value={landingForm.trustDescription}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      trustDescription: e.target.value,
                    })
                  }
                  maxLength={700}
                  rows={3}
                  required
                />
              </Field>
              <Field label="Simulated activity disclosure" wide>
                <textarea
                  value={landingForm.disclosure}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, disclosure: e.target.value })
                  }
                  maxLength={1000}
                  rows={4}
                  required
                />
              </Field>
              <Field label="Footer text" wide>
                <input
                  value={landingForm.footerText}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, footerText: e.target.value })
                  }
                  maxLength={240}
                  required
                />
              </Field>
              <Field label="SEO title" wide>
                <input
                  value={landingForm.seoTitle}
                  onChange={(e) =>
                    setLandingForm({ ...landingForm, seoTitle: e.target.value })
                  }
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="SEO description" wide>
                <textarea
                  value={landingForm.seoDescription}
                  onChange={(e) =>
                    setLandingForm({
                      ...landingForm,
                      seoDescription: e.target.value,
                    })
                  }
                  maxLength={320}
                  rows={3}
                  required
                />
              </Field>
            </div>

            <div className={styles.actions}>
              <button type="submit" disabled={!canManage || Boolean(busy)}>
                Create immutable draft revision
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setLandingForm(clone(landing.effective))}
                disabled={Boolean(busy)}
              >
                Reset to current
              </button>
            </div>
          </form>

          <History
            title="Landing revision history"
            revisions={landing.revisions}
            currentId={landing.publishedRevision?.id ?? null}
            busy={Boolean(busy)}
            canPublish={canPublish}
            onLoad={(revision) => setLandingForm(clone(revision.payload))}
            onPublish={publishLanding}
          />
        </div>
      ) : null}

      {tab === "email" && selectedEmail && emailForm ? (
        <div className={styles.columns}>
          <form className={styles.panel} onSubmit={createEmailDraft}>
            <div className={styles.panelHeading}>
              <div>
                <span>EMAIL CONTENT TEMPLATE</span>
                <h2>{selectedEmail.templateKey}</h2>
              </div>
              <select
                value={selectedEmailKey}
                onChange={(e) => chooseEmail(e.target.value)}
              >
                {emails.map((item) => (
                  <option value={item.contentKey} key={item.contentKey}>
                    {item.contentKey}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.variables}>
              <span>Allowed variables:</span>
              {selectedEmail.allowedVariables.map((variable) => (
                <code key={variable}>{`{{${variable}}}`}</code>
              ))}
            </div>

            <div className={styles.formGrid}>
              <Field label="Subject" wide>
                <input
                  value={emailForm.subject}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, subject: e.target.value })
                  }
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Preheader" wide>
                <input
                  value={emailForm.preheader}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, preheader: e.target.value })
                  }
                  maxLength={240}
                  required
                />
              </Field>
              <Field label="Headline" wide>
                <input
                  value={emailForm.headline}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, headline: e.target.value })
                  }
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Plain-text body" wide>
                <textarea
                  value={emailForm.body}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, body: e.target.value })
                  }
                  maxLength={2000}
                  rows={8}
                  required
                />
              </Field>
              <Field label="CTA label" wide>
                <input
                  value={emailForm.ctaLabel}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, ctaLabel: e.target.value })
                  }
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="Footer" wide>
                <textarea
                  value={emailForm.footer}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, footer: e.target.value })
                  }
                  maxLength={700}
                  rows={3}
                  required
                />
              </Field>
            </div>

            <div className={styles.safeNote}>
              HTML is intentionally unsupported. Content is structured/plain text
              and template variables are server-side whitelisted.
            </div>

            <div className={styles.actions}>
              <button type="submit" disabled={!canManage || Boolean(busy)}>
                Create immutable draft revision
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setEmailForm(clone(selectedEmail.effective))}
                disabled={Boolean(busy)}
              >
                Reset to current
              </button>
            </div>
          </form>

          <History
            title={`${selectedEmail.contentKey} history`}
            revisions={selectedEmail.revisions}
            currentId={selectedEmail.publishedRevision?.id ?? null}
            busy={Boolean(busy)}
            canPublish={canPublish}
            onLoad={(revision) => setEmailForm(clone(revision.payload))}
            onPublish={publishEmail}
          />
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? styles.wideField : styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function History<T>({
  title,
  revisions,
  currentId,
  busy,
  canPublish,
  onLoad,
  onPublish,
}: {
  title: string;
  revisions: ContentRevision<T>[];
  currentId: string | null;
  busy: boolean;
  canPublish: boolean;
  onLoad: (revision: ContentRevision<T>) => void;
  onPublish: (revision: ContentRevision<T>) => void;
}) {
  return (
    <aside className={styles.history}>
      <div className={styles.panelHeading}>
        <div>
          <span>VERSION HISTORY</span>
          <h2>{title}</h2>
        </div>
      </div>

      {revisions.length === 0 ? (
        <div className={styles.empty}>No saved revisions yet.</div>
      ) : (
        <div className={styles.revisions}>
          {revisions.map((revision) => {
            const isCurrent = revision.id === currentId;
            return (
              <article className={styles.revision} key={revision.id}>
                <div className={styles.revisionTop}>
                  <strong>v{revision.version}</strong>
                  <span
                    className={
                      isCurrent ? styles.currentStatus : styles.revisionStatus
                    }
                  >
                    {isCurrent ? "CURRENT" : revision.status}
                  </span>
                </div>
                <small>Created {formatDate(revision.createdAt)}</small>
                <small>
                  {revision.publishedAt
                    ? `First published ${formatDate(revision.publishedAt)}`
                    : "Draft has never been published"}
                </small>
                <div className={styles.revisionActions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => onLoad(revision)}
                    disabled={busy}
                  >
                    Load content
                  </button>
                  <button
                    type="button"
                    onClick={() => onPublish(revision)}
                    disabled={!canPublish || busy || isCurrent}
                  >
                    {revision.status === "PUBLISHED"
                      ? "Set current"
                      : "Publish"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}
