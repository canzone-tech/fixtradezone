"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/closeout/closeout.module.css";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";

interface NotificationRecord {
  id: string;
  category: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  total: number;
  unreadTotal: number;
  notifications: NotificationRecord[];
  message?: string;
  redirectTo?: string | null;
}

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

async function checked<T extends UserApiPayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;

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

export default function UserNotificationsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [rows, setRows] = useState<NotificationRecord[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (nextUnreadOnly: boolean) => {
      setLoading(true);
      setError(null);

      try {
        const [sessionResponse, notificationsResponse] = await Promise.all([
          fetch("/api/user/session", { cache: "no-store" }),
          fetch(`/api/user/notifications?limit=100&unreadOnly=${nextUnreadOnly}`, {
            cache: "no-store",
          }),
        ]);

        const nextSession = await checked<UserDirectSession & UserApiPayload>(
          sessionResponse,
          "USER session is unavailable.",
        );
        const notifications = await checked<NotificationListResponse>(
          notificationsResponse,
          "Could not load notifications.",
        );

        setSession(nextSession);
        setRows(notifications.notifications);
        setUnreadTotal(notifications.unreadTotal);
      } catch (caught) {
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load notifications.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load(unreadOnly);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load, unreadOnly]);

  async function markRead(notificationId: string) {
    setBusyId(notificationId);
    setError(null);

    try {
      const response = await fetch(
        `/api/user/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "PATCH" },
      );
      await checked<UserApiPayload>(
        response,
        "Notification could not be marked read.",
      );
      await load(unreadOnly);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Notification could not be marked read.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBusyId("ALL");
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/notifications/read-all", {
        method: "POST",
      });
      const payload = await checked<UserApiPayload & { updated?: number }>(
        response,
        "Notifications could not be marked read.",
      );
      setSuccess(`${payload.updated ?? 0} notification(s) marked read.`);
      await load(unreadOnly);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Notifications could not be marked read.",
      );
    } finally {
      setBusyId(null);
    }
  }

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
          <p className={styles.eyebrow}>NOTIFY-01 / USER INBOX</p>
          <h1>Notifications</h1>
          <p>
            Read operational, finance, security, and general platform messages.
            Notification delivery history cannot be deleted from the user portal.
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Inbox</p>
              <h2>{unreadTotal} unread</h2>
            </div>
            <div className={styles.toolbar}>
              <label>
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(event) => setUnreadOnly(event.target.checked)}
                />{" "}
                Unread only
              </label>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => void markAllRead()}
                disabled={busyId !== null || unreadTotal === 0}
              >
                Mark all read
              </button>
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading notifications…</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>No notifications to show.</div>
          ) : (
            <div className={styles.page}>
              {rows.map((row) => (
                <article
                  className={styles.notification}
                  data-unread={!row.readAt}
                  key={row.id}
                >
                  <div className={styles.notificationHeader}>
                    <div className={styles.notificationTitle}>
                      <span className={styles.badge}>{row.category}</span>
                      <strong>{row.title}</strong>
                    </div>
                    <span className={styles.meta}>
                      {formatPlatformDateTime(row.createdAt)}
                    </span>
                  </div>
                  <p>{row.message}</p>
                  {!row.readAt ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => void markRead(row.id)}
                        disabled={busyId !== null}
                      >
                        {busyId === row.id ? "Updating…" : "Mark read"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
