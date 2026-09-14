"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/closeout/closeout.module.css";
import FlashMessage from "@/components/ui/flash-message";
import { resolveAdminSession } from "@/lib/admin-session-client";
import { formatPlatformDateTime } from "@/lib/platform-time";
import {
  formatSupportStatus,
  type SupportAssignee,
  type SupportCategory,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_TRANSITIONS,
  type SupportTicket,
  type SupportTicketDetail,
  type SupportTicketStatus,
  supportStatusTone,
} from "@/lib/support-types";

interface ApiMessage {
  message?: string;
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & ApiMessage)
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? fallback);
  }
  return payload;
}

function eventCopy(entry: SupportTicketDetail["entries"][number]): string {
  if (entry.body) return entry.body;
  if (!entry.metadata || typeof entry.metadata !== "object") {
    return "Ticket history updated.";
  }
  const metadata = entry.metadata as Record<string, unknown>;
  if (entry.type === "STATUS_CHANGE") {
    const from = typeof metadata.fromStatus === "string" ? metadata.fromStatus : "";
    const to = typeof metadata.toStatus === "string" ? metadata.toStatus : "";
    return `${from.replaceAll("_", " ")} → ${to.replaceAll("_", " ")}`;
  }
  if (entry.type === "ASSIGNMENT_CHANGE") {
    const to = typeof metadata.toUserId === "string" ? metadata.toUserId : null;
    return to ? `Assigned to ${to}` : "Ticket unassigned.";
  }
  return "Ticket history updated.";
}

function entryTitle(type: SupportTicketDetail["entries"][number]["type"]) {
  switch (type) {
    case "USER_REPLY":
      return "USER reply";
    case "STAFF_REPLY":
      return "Staff reply";
    case "INTERNAL_NOTE":
      return "Internal note";
    case "STATUS_CHANGE":
      return "Status change";
    case "ASSIGNMENT_CHANGE":
      return "Assignment change";
  }
}

export default function SupportAdminClient() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [assignees, setAssignees] = useState<SupportAssignee[]>([]);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canReply, setCanReply] = useState(false);
  const [canAssign, setCanAssign] = useState(false);
  const [canStatus, setCanStatus] = useState(false);
  const [canNotes, setCanNotes] = useState(false);
  const [canCategories, setCanCategories] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | SupportTicketStatus>("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");

  const loadDetail = useCallback(async (ticketId: string) => {
    const response = await fetch(
      `/api/admin/support/tickets/${encodeURIComponent(ticketId)}`,
      { cache: "no-store" },
    );
    const detail = await json<SupportTicketDetail>(
      response,
      "Could not load the support ticket.",
    );
    setSelected(detail);
    setAssigneeId(detail.ticket.assignedToUserId ?? "");
  }, []);

  const loadWorkspace = useCallback(
    async (filters?: {
      search?: string;
      status?: string;
      categoryId?: string;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const session = await resolveAdminSession();
        if (session.status === 401 || !session.user) {
          router.replace("/login");
          return;
        }

        const superAdmin = session.user.roles.includes("SUPER_ADMIN");
        const has = (permission: string) =>
          superAdmin || session.user!.permissions.includes(permission);

        if (!has("support.tickets.read")) {
          router.replace("/dashboard");
          return;
        }

        const nextCanReply = has("support.tickets.reply");
        const nextCanAssign = has("support.tickets.assign");
        const nextCanStatus = has("support.tickets.status.manage");
        const nextCanNotes = has("support.tickets.notes.manage");
        const nextCanCategories = has("support.categories.manage");
        setCanReply(nextCanReply);
        setCanAssign(nextCanAssign);
        setCanStatus(nextCanStatus);
        setCanNotes(nextCanNotes);
        setCanCategories(nextCanCategories);

        const params = new URLSearchParams({ limit: "100" });
        const effectiveSearch = filters?.search ?? search;
        const effectiveStatus = filters?.status ?? status;
        const effectiveCategory = filters?.categoryId ?? filterCategoryId;
        if (effectiveSearch.trim()) params.set("search", effectiveSearch.trim());
        if (effectiveStatus) params.set("status", effectiveStatus);
        if (effectiveCategory) params.set("categoryId", effectiveCategory);

        const [ticketsResponse, categoriesResponse, assigneesResponse] =
          await Promise.all([
            fetch(`/api/admin/support/tickets?${params.toString()}`, {
              cache: "no-store",
            }),
            fetch("/api/admin/support/categories", { cache: "no-store" }),
            nextCanAssign
              ? fetch("/api/admin/support/assignees", { cache: "no-store" })
              : Promise.resolve(null),
          ]);

        const ticketPayload = await json<{
          total: number;
          tickets: SupportTicket[];
        }>(ticketsResponse, "Could not load support queue.");
        const categoryPayload = await json<{ categories: SupportCategory[] }>(
          categoriesResponse,
          "Could not load support categories.",
        );
        setTickets(ticketPayload.tickets);
        setCategories(categoryPayload.categories);

        if (assigneesResponse) {
          const assigneePayload = await json<{ assignees: SupportAssignee[] }>(
            assigneesResponse,
            "Could not load support assignees.",
          );
          setAssignees(assigneePayload.assignees);
        } else {
          setAssignees([]);
        }
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load support queue.",
        );
      } finally {
        setLoading(false);
      }
    },
    [filterCategoryId, router, search, status],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // Initial permission-aware workspace load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutateTicket(
    path: string,
    method: "POST" | "PATCH",
    body: object,
    successMessage: string,
  ) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/support/tickets/${encodeURIComponent(selected.ticket.id)}/${path}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const detail = await json<SupportTicketDetail>(
        response,
        "Support ticket could not be updated.",
      );
      setSelected(detail);
      setAssigneeId(detail.ticket.assignedToUserId ?? "");
      setSuccess(successMessage);
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Support ticket could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutateTicket("replies", "POST", { message: reply.trim() }, "Reply sent.");
    setReply("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutateTicket("notes", "POST", { message: note.trim() }, "Internal note added.");
    setNote("");
  }

  async function applyAssignment() {
    await mutateTicket(
      "assignment",
      "PATCH",
      { assignedToUserId: assigneeId || null },
      assigneeId ? "Ticket assigned." : "Ticket unassigned.",
    );
  }

  async function changeStatus(nextStatus: SupportTicketStatus) {
    await mutateTicket(
      "status",
      "PATCH",
      { status: nextStatus },
      `Ticket moved to ${formatSupportStatus(nextStatus)}.`,
    );
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/support/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: categoryCode.trim().toUpperCase(),
          name: categoryName.trim(),
          description: categoryDescription.trim() || undefined,
        }),
      });
      await json(response, "Support category could not be created.");
      setCategoryCode("");
      setCategoryName("");
      setCategoryDescription("");
      setSuccess("Support category created.");
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Support category could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(category: SupportCategory) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/support/categories/${encodeURIComponent(category.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !category.isActive }),
        },
      );
      await json(response, "Support category could not be updated.");
      setSuccess(
        `${category.name} ${category.isActive ? "deactivated" : "activated"}.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Support category could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = selected
    ? SUPPORT_STATUS_TRANSITIONS[selected.ticket.status]
    : [];
  const staffReplyable =
    selected !== null &&
    selected.ticket.status !== "RESOLVED" &&
    selected.ticket.status !== "CLOSED";

  return (
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
        <p className={styles.eyebrow}>SUPPORT-01 / OPERATIONS QUEUE</p>
        <h1>Support Queue</h1>
        <p>
          Read, assign, reply to, and resolve USER tickets according to backend
          RBAC. Internal notes remain staff-only and ticket history remains
          append-only.
        </p>
      </section>

      <section className={styles.card}>
        <h2>Queue filters</h2>
        <form
          className={styles.formGrid}
          onSubmit={(event) => {
            event.preventDefault();
            void loadWorkspace();
          }}
        >
          <div className={styles.field}>
            <label htmlFor="support-search">Search</label>
            <input
              id="support-search"
              className={styles.input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ticket, subject, username, or email"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="support-status-filter">Status</label>
            <select
              id="support-status-filter"
              className={styles.select}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "" | SupportTicketStatus)
              }
            >
              <option value="">All statuses</option>
              {SUPPORT_STATUSES.map((item) => (
                <option value={item} key={item}>
                  {formatSupportStatus(item)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="support-category-filter">Category</label>
            <select
              id="support-category-filter"
              className={styles.select}
              value={filterCategoryId}
              onChange={(event) => setFilterCategoryId(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={loading}>
              Apply filters
            </button>
            <button
              className={styles.buttonSecondary}
              type="button"
              disabled={loading}
              onClick={() => {
                setSearch("");
                setStatus("");
                setFilterCategoryId("");
                void loadWorkspace({ search: "", status: "", categoryId: "" });
              }}
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.notificationHeader}>
          <div>
            <p className={styles.eyebrow}>TICKET QUEUE</p>
            <h2>{tickets.length} ticket(s)</h2>
          </div>
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={() => void loadWorkspace()}
            disabled={loading || busy}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading support queue…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.empty}>No tickets match the current filters.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>USER</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Activity</th>
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
                    <td>
                      <strong>{ticket.user.username ?? ticket.user.id}</strong>
                      <div className={styles.meta}>{ticket.user.email}</div>
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
                    <td>{ticket.assignedTo?.username ?? "Unassigned"}</td>
                    <td>{formatPlatformDateTime(ticket.lastActivityAt)}</td>
                    <td>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => void loadDetail(ticket.id)}
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
                {selected.ticket.user.username ?? selected.ticket.user.id} ·{" "}
                {selected.ticket.categoryName} ·{" "}
                {formatSupportStatus(selected.ticket.status)}
              </p>
            </div>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => setSelected(null)}
              disabled={busy}
            >
              Close view
            </button>
          </div>

          <div className={styles.grid}>
            <div className={styles.metric}>
              <small>STATUS</small>
              <strong>{formatSupportStatus(selected.ticket.status)}</strong>
            </div>
            <div className={styles.metric}>
              <small>ASSIGNEE</small>
              <strong>{selected.ticket.assignedTo?.username ?? "Unassigned"}</strong>
            </div>
            <div className={styles.metric}>
              <small>LAST ACTIVITY</small>
              <strong>{formatPlatformDateTime(selected.ticket.lastActivityAt)}</strong>
            </div>
          </div>

          {canAssign && selected.ticket.status !== "CLOSED" ? (
            <div className={styles.toolbar}>
              <div className={styles.field}>
                <label htmlFor="support-assignee">Assign ticket</label>
                <select
                  id="support-assignee"
                  className={styles.select}
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option value={assignee.id} key={assignee.id}>
                      {assignee.username}
                      {assignee.email ? ` · ${assignee.email}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => void applyAssignment()}
                disabled={busy}
              >
                Apply assignment
              </button>
            </div>
          ) : null}

          {canStatus && nextStatuses.length > 0 ? (
            <div className={styles.actions}>
              {nextStatuses.map((nextStatus) => (
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  key={nextStatus}
                  onClick={() => void changeStatus(nextStatus)}
                  disabled={busy}
                >
                  Move to {formatSupportStatus(nextStatus)}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.page}>
            {selected.entries.map((entry) => (
              <article className={styles.notification} key={entry.id}>
                <div className={styles.notificationHeader}>
                  <div className={styles.notificationTitle}>
                    <span className={styles.badge}>{entryTitle(entry.type)}</span>
                    <strong>{entry.author?.username ?? "System"}</strong>
                  </div>
                  <span className={styles.meta}>
                    {formatPlatformDateTime(entry.createdAt)}
                  </span>
                </div>
                <p>{eventCopy(entry)}</p>
              </article>
            ))}
          </div>

          {canReply && staffReplyable ? (
            <form className={styles.formGrid} onSubmit={sendReply}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="staff-support-reply">Reply to USER</label>
                <textarea
                  id="staff-support-reply"
                  className={styles.textarea}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={4000}
                  disabled={busy}
                  required
                />
              </div>
              <div className={styles.actions}>
                <button className={styles.button} type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send reply"}
                </button>
              </div>
            </form>
          ) : null}

          {canNotes && selected.ticket.status !== "CLOSED" ? (
            <form className={styles.formGrid} onSubmit={addNote}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="support-internal-note">Internal note</label>
                <textarea
                  id="support-internal-note"
                  className={styles.textarea}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={4000}
                  disabled={busy}
                  required
                />
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.buttonSecondary}
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Add internal note"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {canCategories ? (
        <section className={styles.card}>
          <h2>Support categories</h2>
          <form className={styles.formGrid} onSubmit={createCategory}>
            <div className={styles.field}>
              <label htmlFor="support-category-code">Code</label>
              <input
                id="support-category-code"
                className={styles.input}
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
                placeholder="TECHNICAL_SUPPORT"
                maxLength={60}
                disabled={busy}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="support-category-name">Name</label>
              <input
                id="support-category-name"
                className={styles.input}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={100}
                disabled={busy}
                required
              />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="support-category-description">Description</label>
              <input
                id="support-category-description"
                className={styles.input}
                value={categoryDescription}
                onChange={(event) => setCategoryDescription(event.target.value)}
                maxLength={255}
                disabled={busy}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={busy}>
                Create category
              </button>
            </div>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Code</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                      <div className={styles.meta}>{category.description}</div>
                    </td>
                    <td>{category.code}</td>
                    <td>
                      <span
                        className={styles.badge}
                        data-tone={category.isActive ? "success" : "warning"}
                      >
                        {category.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => void toggleCategory(category)}
                        disabled={busy}
                      >
                        {category.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
