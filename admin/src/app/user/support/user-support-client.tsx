"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/closeout/closeout.module.css";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import {
  formatSupportStatus,
  type SupportAttachment,
  type SupportAttachmentList,
  type SupportCategory,
  type SupportTicket,
  type SupportTicketDetail,
  supportStatusTone,
} from "@/lib/support-types";
import type { UserDirectSession } from "@/lib/user-session";

const MAX_ATTACHMENT_FILES = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

interface UserApiPayload {
  message?: string;
  redirectTo?: string | null;
}

class UserAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserAccessError";
  }
}

async function checked<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & UserApiPayload)
    | null;

  if (response.status === 401 || response.status === 403) {
    throw new UserAccessError(
      payload?.message ?? fallback,
      response.status,
      payload?.redirectTo ?? null,
    );
  }

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? fallback);
  }

  return payload;
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

function entryLabel(type: SupportTicketDetail["entries"][number]["type"]): string {
  switch (type) {
    case "USER_REPLY":
      return "You";
    case "STAFF_REPLY":
      return "Support";
    case "STATUS_CHANGE":
      return "Status update";
    default:
      return "Ticket update";
  }
}

function statusChangeCopy(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "Ticket status updated.";
  const record = metadata as Record<string, unknown>;
  const from = typeof record.fromStatus === "string" ? record.fromStatus : null;
  const to = typeof record.toStatus === "string" ? record.toStatus : null;
  if (!from || !to) return "Ticket status updated.";
  return `${from.replaceAll("_", " ")} → ${to.replaceAll("_", " ")}`;
}

function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateSelectedFiles(fileList: FileList | null): File[] {
  const files = Array.from(fileList ?? []);
  if (files.length > MAX_ATTACHMENT_FILES) {
    throw new Error(`Select no more than ${MAX_ATTACHMENT_FILES} attachments.`);
  }

  for (const file of files) {
    const name = file.name.toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".pdf"].some((extension) =>
      name.endsWith(extension),
    );
    if (!allowed) {
      throw new Error("Only JPG, JPEG, PNG, and PDF attachments are allowed.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("Each attachment must be 5 MB or smaller.");
    }
  }

  return files;
}

async function uploadAttachments(
  ticketId: string,
  files: File[],
): Promise<SupportAttachmentList> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file, file.name);
  const response = await fetch(
    `/api/user/support/tickets/${encodeURIComponent(ticketId)}/attachments`,
    { method: "POST", body: formData },
  );
  return checked<SupportAttachmentList>(
    response,
    "Support attachments could not be uploaded.",
  );
}

export default function UserSupportClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [ticketFiles, setTicketFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [ticketFileInputKey, setTicketFileInputKey] = useState(0);
  const [replyFileInputKey, setReplyFileInputKey] = useState(0);

  const handleError = useCallback(
    (caught: unknown, fallback: string) => {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      setError(caught instanceof Error ? caught.message : fallback);
    },
    [router],
  );

  const loadTicket = useCallback(
    async (ticketId: string) => {
      try {
        const [response, attachmentResponse] = await Promise.all([
          fetch(`/api/user/support/tickets/${encodeURIComponent(ticketId)}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/user/support/tickets/${encodeURIComponent(ticketId)}/attachments`,
            { cache: "no-store" },
          ),
        ]);
        const detail = await checked<SupportTicketDetail>(
          response,
          "Could not load the support ticket.",
        );
        const attachmentPayload = await checked<SupportAttachmentList>(
          attachmentResponse,
          "Could not load support attachments.",
        );
        setSelected(detail);
        setAttachments(attachmentPayload.attachments);
      } catch (caught) {
        handleError(caught, "Could not load the support ticket.");
      }
    },
    [handleError],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [sessionResponse, categoriesResponse, ticketsResponse] =
        await Promise.all([
          fetch("/api/user/session", { cache: "no-store" }),
          fetch("/api/user/support/categories", { cache: "no-store" }),
          fetch("/api/user/support/tickets?limit=100", { cache: "no-store" }),
        ]);

      const nextSession = await checked<UserDirectSession>(
        sessionResponse,
        "USER session is unavailable.",
      );
      const categoryPayload = await checked<{ categories: SupportCategory[] }>(
        categoriesResponse,
        "Could not load support categories.",
      );
      const ticketPayload = await checked<{
        total: number;
        tickets: SupportTicket[];
      }>(ticketsResponse, "Could not load support tickets.");

      setSession(nextSession);
      setCategories(categoryPayload.categories);
      setTickets(ticketPayload.tickets);
      setCategoryId((current) => current || categoryPayload.categories[0]?.id || "");

      if (selected) {
        const stillExists = ticketPayload.tickets.some(
          (ticket) => ticket.id === selected.ticket.id,
        );
        if (stillExists) await loadTicket(selected.ticket.id);
        else {
          setSelected(null);
          setAttachments([]);
        }
      }
    } catch (caught) {
      handleError(caught, "Could not load support.");
    } finally {
      setLoading(false);
    }
  }, [handleError, loadTicket, selected]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // Initial protected-workspace load only; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const detail = await checked<SupportTicketDetail>(
        response,
        "Support ticket could not be created.",
      );

      let attachmentError: string | null = null;
      if (ticketFiles.length > 0) {
        try {
          await uploadAttachments(detail.ticket.id, ticketFiles);
        } catch (caught) {
          attachmentError =
            caught instanceof Error
              ? caught.message
              : "Attachments could not be uploaded.";
        }
      }

      setSubject("");
      setMessage("");
      setTicketFiles([]);
      setTicketFileInputKey((current) => current + 1);
      setSelected(detail);
      setSuccess(`${detail.ticket.ticketNumber} created.`);
      await load();
      await loadTicket(detail.ticket.id);
      if (attachmentError) {
        setError(`Ticket created, but ${attachmentError}`);
      }
    } catch (caught) {
      handleError(caught, "Support ticket could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const ticketId = selected.ticket.id;
      const response = await fetch(
        `/api/user/support/tickets/${encodeURIComponent(ticketId)}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: reply.trim() }),
        },
      );
      await checked<SupportTicketDetail>(response, "Reply could not be sent.");

      let attachmentError: string | null = null;
      if (replyFiles.length > 0) {
        try {
          await uploadAttachments(ticketId, replyFiles);
        } catch (caught) {
          attachmentError =
            caught instanceof Error
              ? caught.message
              : "Attachments could not be uploaded.";
        }
      }

      setReply("");
      setReplyFiles([]);
      setReplyFileInputKey((current) => current + 1);
      setSuccess("Reply added to the ticket.");
      await load();
      await loadTicket(ticketId);
      if (attachmentError) {
        setError(`Reply sent, but ${attachmentError}`);
      }
    } catch (caught) {
      handleError(caught, "Reply could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const replyable =
    selected !== null &&
    ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"].includes(
      selected.ticket.status,
    );

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        {error ? (
          <FlashMessage
            message={error}
            type="error"
            onClose={() => setError(null)}
          />
        ) : null}
        {success ? (
          <FlashMessage
            message={success}
            type="success"
            onClose={() => setSuccess(null)}
          />
        ) : null}

        <section className={styles.hero}>
          <p className={styles.eyebrow}>SUPPORT-01 / HELP DESK</p>
          <h1>Support</h1>
          <p>
            Create and follow support tickets securely inside FixTradeZone. Do
            not submit passwords, private keys, seed phrases, or authentication
            secrets.
          </p>
        </section>

        <section className={styles.card}>
          <h2>Create a support ticket</h2>
          <form className={styles.formGrid} onSubmit={createTicket}>
            <div className={styles.field}>
              <label htmlFor="support-category">Category</label>
              <select
                id="support-category"
                className={styles.select}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={busy || categories.length === 0}
                required
              >
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="support-subject">Subject</label>
              <input
                id="support-subject"
                className={styles.input}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={160}
                disabled={busy}
                required
              />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="support-message">How can we help?</label>
              <textarea
                id="support-message"
                className={styles.textarea}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={4000}
                disabled={busy}
                required
              />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="support-attachments">Attachments (optional)</label>
              <input
                key={ticketFileInputKey}
                id="support-attachments"
                className={styles.input}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                disabled={busy}
                onChange={(event) => {
                  try {
                    setTicketFiles(validateSelectedFiles(event.target.files));
                    setError(null);
                  } catch (caught) {
                    event.target.value = "";
                    setTicketFiles([]);
                    handleError(caught, "Invalid attachment selection.");
                  }
                }}
              />
              <span className={styles.meta}>
                Optional · JPG/JPEG/PNG/PDF · up to 3 files · 5 MB each
              </span>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.button}
                type="submit"
                disabled={busy || !categoryId}
              >
                {busy ? "Submitting…" : "Create ticket"}
              </button>
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>MY TICKETS</p>
              <h2>{tickets.length} ticket(s)</h2>
            </div>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void load()}
              disabled={loading || busy}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading support tickets…</div>
          ) : tickets.length === 0 ? (
            <div className={styles.empty}>No support tickets yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Last activity</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <strong>{ticket.ticketNumber}</strong>
                        <div className={styles.meta}>{ticket.subject}</div>
                      </td>
                      <td>{ticket.categoryName}</td>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={supportStatusTone(ticket.status)}
                        >
                          {formatSupportStatus(ticket.status)}
                        </span>
                      </td>
                      <td>{formatPlatformDateTime(ticket.lastActivityAt)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => void loadTicket(ticket.id)}
                          disabled={busy}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected ? (
          <section className={styles.card}>
            <div className={styles.notificationHeader}>
              <div>
                <p className={styles.eyebrow}>{selected.ticket.ticketNumber}</p>
                <h2>{selected.ticket.subject}</h2>
                <p>
                  {selected.ticket.categoryName} ·{" "}
                  {formatSupportStatus(selected.ticket.status)}
                </p>
              </div>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => {
                  setSelected(null);
                  setAttachments([]);
                }}
                disabled={busy}
              >
                Close view
              </button>
            </div>

            <div className={styles.page}>
              {selected.entries.map((entry) => (
                <article className={styles.notification} key={entry.id}>
                  <div className={styles.notificationHeader}>
                    <strong>{entryLabel(entry.type)}</strong>
                    <span className={styles.meta}>
                      {formatPlatformDateTime(entry.createdAt)}
                    </span>
                  </div>
                  {entry.body ? <p>{entry.body}</p> : null}
                  {entry.type === "STATUS_CHANGE" ? (
                    <p>{statusChangeCopy(entry.metadata)}</p>
                  ) : null}
                </article>
              ))}
            </div>

            <div className={styles.page}>
              <div className={styles.notificationHeader}>
                <strong>Attachments</strong>
                <span className={styles.meta}>{attachments.length} file(s)</span>
              </div>
              {attachments.length === 0 ? (
                <p className={styles.meta}>No attachments on this ticket.</p>
              ) : (
                attachments.map((attachment) => (
                  <article className={styles.notification} key={attachment.id}>
                    <div className={styles.notificationHeader}>
                      <div>
                        <strong>{attachment.originalName}</strong>
                        <div className={styles.meta}>
                          {attachment.uploadedByLabel ?? "Support"} ·{" "}
                          {formatAttachmentSize(attachment.sizeBytes)} ·{" "}
                          {formatPlatformDateTime(attachment.createdAt)}
                        </div>
                      </div>
                      <a
                        className={styles.buttonSecondary}
                        href={`/api/user/support/tickets/${encodeURIComponent(selected.ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                      >
                        Download
                      </a>
                    </div>
                  </article>
                ))
              )}
            </div>

            {replyable ? (
              <form className={styles.formGrid} onSubmit={sendReply}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="support-reply">Reply</label>
                  <textarea
                    id="support-reply"
                    className={styles.textarea}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={4000}
                    disabled={busy}
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="support-reply-attachments">
                    Attachments (optional)
                  </label>
                  <input
                    key={replyFileInputKey}
                    id="support-reply-attachments"
                    className={styles.input}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    disabled={busy}
                    onChange={(event) => {
                      try {
                        setReplyFiles(validateSelectedFiles(event.target.files));
                        setError(null);
                      } catch (caught) {
                        event.target.value = "";
                        setReplyFiles([]);
                        handleError(caught, "Invalid attachment selection.");
                      }
                    }}
                  />
                  <span className={styles.meta}>
                    Optional · JPG/JPEG/PNG/PDF · up to 3 files · 5 MB each
                  </span>
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </form>
            ) : (
              <p className={styles.meta}>
                This ticket is {formatSupportStatus(selected.ticket.status)} and
                is read-only for USER replies.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </UserShell>
  );
}
