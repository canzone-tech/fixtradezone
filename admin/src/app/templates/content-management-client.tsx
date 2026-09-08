"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./templates.module.css";

type RevisionStatus = "DRAFT" | "PUBLISHED";

type LandingFeature = {
  title: string;
  description: string;
};

type LandingContent = {
  brandName: string;
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  features: LandingFeature[];
  trustTitle: string;
  trustDescription: string;
  disclosure: string;
  footerText: string;
  seoTitle: string;
  seoDescription: string;
};

type EmailTemplateContent = {
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  ctaLabel: string;
  footer: string;
};

type Revision<T> = {
  id: string;
  contentKey: string;
  version: number;
  status: RevisionStatus;
  templateKey: string;
  payload: T;
  createdAt: string;
  publishedAt: string | null;
};

type Workspace<T> = {
  contentKey: string;
  templateKey: string;
  effective: T;
  effectiveSource: "DEFAULT" | "PUBLISHED_REVISION";
  publishedRevision: Revision<T> | null;
  revisions: Revision<T>[];
};

type EmailWorkspace = Workspace<EmailTemplateContent> & {
  allowedVariables: string[];
};

type MessagePayload = { message?: string | string[] };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function messageFrom(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }
  const message = (payload as MessagePayload).message;
  if (typeof message === "string") return message;
  return Array.isArray(message) ? (message[0] ?? fallback) : fallback;
}

async function json<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function hasPermission(user: AdminUser | null, permission: string): boolean {
  return Boolean(
    user &&
      (user.roles.includes("SUPER_ADMIN") ||
        user.permissions.includes(permission)),
  );
}

export default function ContentManagementClient() {
  const router = useRouter();
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [landing, setLanding] = useState<Workspace<LandingContent> | null>(null);
  const [landingForm, setLandingForm] = useState<LandingContent | null>(null);
  const [emails, setEmails] = useState<EmailWorkspace[]>([]);
  const [emailKey, setEmailKey] = useState("");
  const [emailForm, setEmailForm] = useState<EmailTemplateContent | null>(null);
  const [tab, setTab] = useState<"landing" | "email">("landing");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedEmail = useMemo(
    () => emails.find((item) => item.contentKey === emailKey) ?? null,
    [emailKey, emails],
  );

  const canRead = hasPermission(actor, "content.read");
  const canManage = hasPermission(actor, "content.manage");
  const canPublish = hasPermission(actor, "content.publish");

  async function loadWorkspaces(preferredEmailKey?: string) {
    const [landingResponse, emailResponse] = await Promise.all([
      fetch("/api/admin/content/landing", { cache: "no-store" }),
      fetch("/api/admin/content/email-templates", { cache: "no-store" }),
    ]);

    if (landingResponse.status === 401 || emailResponse.status === 401) {
      router.replace("/login");
      throw new Error("Session expired.");
    }

    const landingPayload = await json<Workspace<LandingContent>>(landingResponse);
    const emailPayload = await json<EmailWorkspace[]>(emailResponse);

    if (!landingResponse.ok || !landingPayload) {
      throw new Error(
        messageFrom(landingPayload, "Unable to load landing workspace."),
      );
    }
    if (!emailResponse.ok || !emailPayload) {
      throw new Error(
        messageFrom(emailPayload, "Unable to load email templates."),
      );
    }

    setLanding(landingPayload);
    setLandingForm(clone(landingPayload.effective));
    setEmails(emailPayload);

    const nextKey =
      emailPayload.find((item) => item.contentKey === preferredEmailKey)
        ?.contentKey ?? emailPayload[0]?.contentKey ?? "";
    const nextEmail = emailPayload.find((item) => item.contentKey === nextKey);
    setEmailKey(nextKey);
    setEmailForm(nextEmail ? clone(nextEmail.effective) : null);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const session = await resolveAdminSession();
        if (!active) return;

        if (!session.user) {
          if (session.status === 401 || session.status === 403) {
            router.replace("/login");
            return;
          }
          throw new Error(session.message || "Unable to load administrator session.");
        }

        setActor(session.user);
        const permitted =
          session.user.roles.includes("SUPER_ADMIN") ||
          session.user.permissions.includes("content.read");
        if (!permitted) return;

        await loadWorkspaces();
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Templates / CMS.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
    // Session bootstrap intentionally executes once for this protected workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await json<MessagePayload>(response);
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(messageFrom(payload, "Content request failed."));
      }
      setNotice(messageFrom(payload, "Content updated."));
      await loadWorkspaces(emailKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Content request failed.");
    } finally {
      setBusy(false);
    }
  }

  function selectEmail(nextKey: string) {
    const next = emails.find((item) => item.contentKey === nextKey);
    setEmailKey(nextKey);
    setEmailForm(next ? clone(next.effective) : null);
    setNotice("");
    setError("");
  }

  if (loading) return <div className={styles.state}>Loading Templates / CMS…</div>;
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
            Structured content only. Published revisions remain immutable; rollback
            changes only the current publication pointer.
          </p>
        </div>
        <div className={styles.permissionGrid}>
          <span className={canRead ? styles.allowed : styles.denied}>Read</span>
          <span className={canManage ? styles.allowed : styles.denied}>Draft</span>
          <span className={canPublish ? styles.allowed : styles.denied}>Publish</span>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

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
          <form
            className={styles.panel}
            onSubmit={(event) => {
              event.preventDefault();
              if (canManage) {
                void post("/api/admin/content/landing/drafts", landingForm);
              }
            }}
          >
            <PanelHeading
              label="LANDING CONTENT"
              title={landing.templateKey}
              trailing={landing.effectiveSource}
            />
            <div className={styles.formGrid}>
              <Field label="Brand name">
                <input
                  required
                  maxLength={80}
                  value={landingForm.brandName}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, brandName: event.target.value })
                  }
                />
              </Field>
              <Field label="Badge">
                <input
                  required
                  maxLength={100}
                  value={landingForm.badge}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, badge: event.target.value })
                  }
                />
              </Field>
              <Field label="Hero title" wide>
                <input
                  required
                  maxLength={180}
                  value={landingForm.heroTitle}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, heroTitle: event.target.value })
                  }
                />
              </Field>
              <Field label="Hero accent" wide>
                <input
                  required
                  maxLength={120}
                  value={landingForm.heroAccent}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, heroAccent: event.target.value })
                  }
                />
              </Field>
              <Field label="Hero description" wide>
                <textarea
                  required
                  rows={4}
                  maxLength={800}
                  value={landingForm.heroDescription}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      heroDescription: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Primary CTA label">
                <input
                  required
                  maxLength={60}
                  value={landingForm.primaryCtaLabel}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      primaryCtaLabel: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Primary CTA path / HTTPS URL">
                <input
                  required
                  maxLength={300}
                  value={landingForm.primaryCtaHref}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      primaryCtaHref: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Secondary CTA label">
                <input
                  required
                  maxLength={60}
                  value={landingForm.secondaryCtaLabel}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      secondaryCtaLabel: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Secondary CTA path / HTTPS URL">
                <input
                  required
                  maxLength={300}
                  value={landingForm.secondaryCtaHref}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      secondaryCtaHref: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <div className={styles.subheading}>Feature cards</div>
            <div className={styles.featureEditors}>
              {landingForm.features.map((feature, index) => (
                <div className={styles.featureEditor} key={`${index}-${feature.title}`}>
                  <input
                    required
                    maxLength={80}
                    aria-label={`Feature ${index + 1} title`}
                    value={feature.title}
                    onChange={(event) => {
                      const features = clone(landingForm.features);
                      features[index].title = event.target.value;
                      setLandingForm({ ...landingForm, features });
                    }}
                  />
                  <textarea
                    required
                    rows={3}
                    maxLength={320}
                    aria-label={`Feature ${index + 1} description`}
                    value={feature.description}
                    onChange={(event) => {
                      const features = clone(landingForm.features);
                      features[index].description = event.target.value;
                      setLandingForm({ ...landingForm, features });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className={styles.formGrid}>
              <Field label="Trust title" wide>
                <input
                  required
                  maxLength={160}
                  value={landingForm.trustTitle}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, trustTitle: event.target.value })
                  }
                />
              </Field>
              <Field label="Trust description" wide>
                <textarea
                  required
                  rows={3}
                  maxLength={700}
                  value={landingForm.trustDescription}
                  onChange={(event) =>
                    setLandingForm({
                      ...landingForm,
                      trustDescription: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Simulated activity disclosure" wide>
                <textarea
                  required
                  rows={4}
                  maxLength={1000}
                  value={landingForm.disclosure}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, disclosure: event.target.value })
                  }
                />
              </Field>
              <Field label="Footer text" wide>
                <input
                  required
                  maxLength={240}
                  value={landingForm.footerText}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, footerText: event.target.value })
                  }
                />
              </Field>
              <Field label="SEO title" wide>
                <input
                  required
                  maxLength={120}
                  value={landingForm.seoTitle}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, seoTitle: event.target.value })
                  }
                />
              </Field>
              <Field label="SEO description" wide>
                <textarea
                  required
                  rows={3}
                  maxLength={320}
                  value={landingForm.seoDescription}
                  onChange={(event) =>
                    setLandingForm({ ...landingForm, seoDescription: event.target.value })
                  }
                />
              </Field>
            </div>

            <EditorActions
              busy={busy}
              canManage={canManage}
              onReset={() => setLandingForm(clone(landing.effective))}
            />
          </form>

          <History
            title="Landing revision history"
            revisions={landing.revisions}
            currentId={landing.publishedRevision?.id ?? null}
            busy={busy}
            canPublish={canPublish}
            onLoad={(revision) => setLandingForm(clone(revision.payload))}
            onPublish={(revision) =>
              void post(
                `/api/admin/content/landing/${encodeURIComponent(revision.id)}/publish`,
              )
            }
          />
        </div>
      ) : null}

      {tab === "email" && selectedEmail && emailForm ? (
        <div className={styles.columns}>
          <form
            className={styles.panel}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canManage) {
                void post(
                  `/api/admin/content/email-templates/${encodeURIComponent(emailKey)}/drafts`,
                  emailForm,
                );
              }
            }}
          >
            <div className={styles.panelHeading}>
              <div>
                <span>EMAIL CONTENT TEMPLATE</span>
                <h2>{selectedEmail.templateKey}</h2>
              </div>
              <select value={emailKey} onChange={(event) => selectEmail(event.target.value)}>
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
              {(
                [
                  ["subject", "Subject", 180],
                  ["preheader", "Preheader", 240],
                  ["headline", "Headline", 180],
                  ["ctaLabel", "CTA label", 80],
                ] as const
              ).map(([key, label, maxLength]) => (
                <Field label={label} wide key={key}>
                  <input
                    required
                    maxLength={maxLength}
                    value={emailForm[key]}
                    onChange={(event) =>
                      setEmailForm({ ...emailForm, [key]: event.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Plain-text body" wide>
                <textarea
                  required
                  rows={8}
                  maxLength={2000}
                  value={emailForm.body}
                  onChange={(event) =>
                    setEmailForm({ ...emailForm, body: event.target.value })
                  }
                />
              </Field>
              <Field label="Footer" wide>
                <textarea
                  required
                  rows={3}
                  maxLength={700}
                  value={emailForm.footer}
                  onChange={(event) =>
                    setEmailForm({ ...emailForm, footer: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className={styles.safeNote}>
              HTML is intentionally unsupported. Content is structured/plain text and
              template variables are server-side whitelisted.
            </div>
            <EditorActions
              busy={busy}
              canManage={canManage}
              onReset={() => setEmailForm(clone(selectedEmail.effective))}
            />
          </form>

          <History
            title={`${selectedEmail.contentKey} history`}
            revisions={selectedEmail.revisions}
            currentId={selectedEmail.publishedRevision?.id ?? null}
            busy={busy}
            canPublish={canPublish}
            onLoad={(revision) => setEmailForm(clone(revision.payload))}
            onPublish={(revision) =>
              void post(
                `/api/admin/content/email-templates/${encodeURIComponent(emailKey)}/${encodeURIComponent(revision.id)}/publish`,
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  wide = false,
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

function PanelHeading({
  label,
  title,
  trailing,
}: {
  label: string;
  title: string;
  trailing: string;
}) {
  return (
    <div className={styles.panelHeading}>
      <div>
        <span>{label}</span>
        <h2>{title}</h2>
      </div>
      <span className={styles.source}>{trailing}</span>
    </div>
  );
}

function EditorActions({
  busy,
  canManage,
  onReset,
}: {
  busy: boolean;
  canManage: boolean;
  onReset: () => void;
}) {
  return (
    <div className={styles.actions}>
      <button type="submit" disabled={!canManage || busy}>
        Create immutable draft revision
      </button>
      <button
        type="button"
        className={styles.secondary}
        onClick={onReset}
        disabled={busy}
      >
        Reset to current
      </button>
    </div>
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
  revisions: Revision<T>[];
  currentId: string | null;
  busy: boolean;
  canPublish: boolean;
  onLoad: (revision: Revision<T>) => void;
  onPublish: (revision: Revision<T>) => void;
}) {
  return (
    <aside className={styles.history}>
      <PanelHeading label="VERSION HISTORY" title={title} trailing="IMMUTABLE" />
      {revisions.length === 0 ? (
        <div className={styles.empty}>No saved revisions yet.</div>
      ) : (
        <div className={styles.revisions}>
          {revisions.map((revision) => {
            const current = revision.id === currentId;
            return (
              <article className={styles.revision} key={revision.id}>
                <div className={styles.revisionTop}>
                  <strong>v{revision.version}</strong>
                  <span className={current ? styles.currentStatus : styles.revisionStatus}>
                    {current ? "CURRENT" : revision.status}
                  </span>
                </div>
                <small>Created {formatPlatformDateTime(revision.createdAt)}</small>
                <small>
                  {revision.publishedAt
                    ? `First published ${formatPlatformDateTime(revision.publishedAt)}`
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
                    disabled={!canPublish || busy || current}
                  >
                    {revision.status === "PUBLISHED" ? "Set current" : "Publish"}
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
