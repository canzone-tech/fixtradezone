"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";

type NotificationCategory = "GENERAL" | "SYSTEM" | "FINANCE" | "SECURITY";
type NotificationAudience = "USER" | "ALL_USERS";

interface NotificationRecord {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  category: NotificationCategory;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  total: number;
  notifications: NotificationRecord[];
  message?: string;
}

interface CreateResponse {
  recipientCount: number;
  message?: string;
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? fallback);
  }

  return payload;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationsAdminClient() {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [audience, setAudience] = useState<NotificationAudience>("USER");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("GENERAL");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [session, response] = await Promise.all([
        resolveAdminSession(),
        fetch("/api/admin/notifications?limit=100", { cache: "no-store" }),
      ]);

      if (session.status === 401 || !session.user) {
        router.replace("/login");
        return;
      }

      const superAdmin = session.user.roles.includes("SUPER_ADMIN");
      setCanManage(
        superAdmin || session.user.permissions.includes("notifications.manage"),
      );

      const payload = await json<NotificationListResponse>(
        response,
        "Could not load notifications.",
      );
      setRows(payload.notifications);
      setTotal(payload.total);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (!canManage) {
        throw new Error("You do not have permission to create notifications.");
      }

      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          ...(audience === "USER"
            ? { recipientUserId: recipientUserId.trim() }
            : {}),
          category,
          title: title.trim(),
          message: message.trim(),
        }),
      });

      const payload = await json<CreateResponse>(
        response,
        "Notification could not be created.",
      );

      setTitle("");
      setMessage("");
      if (audience === "USER") setRecipientUserId("");
      setSuccess(
        `Notification created for ${payload.recipientCount} recipient${
          payload.recipientCount === 1 ? "" : "s"
        }.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Notification could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

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
        <p className={styles.eyebrow}>NOTIFY-01 / IN-APP NOTIFICATIONS</p>
        <h1>Notifications</h1>
        <p>
          Create targeted or broadcast in-app messages. Delivery history is
          retained; users may only change their read state.
        </p>
      </section>

      {canManage ? (
        <section className={styles.card}>
          <h2>Create notification</h2>
          <form className={styles.formGrid} onSubmit={createNotification}>
            <div className={styles.field}>
              <label htmlFor="notification-audience">Audience</label>
              <select
                id="notification-audience"
                className={styles.select}
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as NotificationAudience)
                }
                disabled={busy}
              >
                <option value="USER">Single USER</option>
                <option value="ALL_USERS">All standard users</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="notification-category">Category</label>
              <select
                id="notification-category"
                className={styles.select}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as NotificationCategory)
                }
                disabled={busy}
              >
                <option value="GENERAL">General</option>
                <option value="SYSTEM">System</option>
                <option value="FINANCE">Finance</option>
                <option value="SECURITY">Security</option>
              </select>
            </div>

            {audience === "USER" ? (
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="notification-user-id">Recipient USER UUID</label>
                <input
                  id="notification-user-id"
                  className={styles.input}
                  value={recipientUserId}
                  onChange={(event) => setRecipientUserId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={busy}
                  required
                />
              </div>
            ) : null}

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="notification-title">Title</label>
              <input
                id="notification-title"
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                disabled={busy}
                required
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="notification-message">Message</label>
              <textarea
                id="notification-message"
                className={styles.textarea}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                disabled={busy}
                required
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create notification"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.card}>
        <div className={styles.notificationHeader}>
          <div>
            <p className={styles.eyebrow}>Delivery History</p>
            <h2>{total} notification records</h2>
          </div>
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading notifications…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>No notification records yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Category</th>
                  <th>Message</th>
                  <th>State</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.username}</strong>
                      <div className={styles.meta}>{row.email ?? row.userId}</div>
                    </td>
                    <td>
                      <span className={styles.badge}>{row.category}</span>
                    </td>
                    <td>
                      <strong>{row.title}</strong>
                      <div className={styles.meta}>{row.message}</div>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        data-tone={row.readAt ? "success" : "warning"}
                      >
                        {row.readAt ? "READ" : "UNREAD"}
                      </span>
                    </td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
