"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserImpersonationSession } from "@/lib/user-session";
import styles from "./impersonation.module.css";

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getMessage(payload: unknown, fallback: string): string {
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

export default function ImpersonationClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserImpersonationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/impersonation/session", {
          cache: "no-store",
        });

        const payload = await readPayload<
          UserImpersonationSession & { message?: string }
        >(response);

        if (response.status === 401) {
          router.replace("/users");
          router.refresh();
          return;
        }

        if (
          !response.ok ||
          !payload?.user ||
          !payload.impersonation ||
          !payload.sessionPolicy ||
          (payload.impersonation.accessMode !== "FULL" &&
            payload.impersonation.accessMode !== "LIMITED")
        ) {
          throw new Error(getMessage(payload, "Unable to load user session."));
        }

        if (mounted) {
          setSession(payload);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load user session.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function returnToAdmin() {
    setReturning(true);
    setError("");

    try {
      const response = await fetch("/api/admin/users/impersonation", {
        method: "DELETE",
      });

      const payload = await readPayload<{ message?: string }>(response);

      if (!response.ok) {
        throw new Error(
          getMessage(payload, "Unable to return to administrator account."),
        );
      }

      router.replace("/users");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to return to administrator account.",
      );
    } finally {
      setReturning(false);
    }
  }

  if (loading) {
    return (
      <UserShell
        session={session}
        returning={returning}
        onReturnToAdmin={() => void returnToAdmin()}
      >
        <section className={styles.page}>
          <div className={styles.loading}>Loading live USER account…</div>
        </section>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell
        session={null}
        returning={returning}
        onReturnToAdmin={() => void returnToAdmin()}
      >
        <section className={styles.page}>
          <div className={styles.error}>
            {error || "User impersonation session is unavailable."}
          </div>
        </section>
      </UserShell>
    );
  }

  const user = session.user;
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <UserShell
      session={session}
      returning={returning}
      onReturnToAdmin={() => void returnToAdmin()}
    >
      <section id="overview" className={styles.page}>
        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.hero}>
          <span className={styles.eyebrow}>USER ACCOUNT OVERVIEW</span>

          <h2>{displayName}</h2>

          <p>{user.email}</p>

          <div className={styles.badges}>
            <span>{user.status}</span>

            {user.roles.map((role) => (
              <span key={role}>{role}</span>
            ))}

            <span>{session.impersonation.accessMode} ACCESS</span>
          </div>
        </section>

        <section id="account-details" className={styles.card}>
          <div>
            <span className={styles.label}>Username</span>
            <strong>{user.username ? `@${user.username}` : "Not set"}</strong>
          </div>

          <div>
            <span className={styles.label}>Phone</span>
            <strong>{user.phone || "Not set"}</strong>
          </div>

          <div>
            <span className={styles.label}>Account created</span>
            <strong>{formatPlatformDateTime(user.createdAt)}</strong>
          </div>

          <div>
            <span className={styles.label}>Last login</span>
            <strong>
              {user.lastLoginAt
                ? formatPlatformDateTime(user.lastLoginAt)
                : "No login recorded"}
            </strong>
          </div>
        </section>

        <section id="session-status" className={styles.notice}>
          <div className={styles.noticeTitle}>
            <span className={styles.noticeIcon}>
              <i className="iconoir-shield-check" />
            </span>

            <div>
              <strong>Real USER session active</strong>
              <small>
                {session.impersonation.accessMode} impersonation boundary
              </small>
            </div>
          </div>

          <p>
            This account is authenticated using the dedicated impersonation
            session. Authorization resolves against this USER identity and
            administrator privileges are not inherited.
          </p>

          <div className={styles.sessionMeta}>
            <span>
              <i className="iconoir-timer" />
              Idle lock: {session.sessionPolicy.idleLockMinutes} min
            </span>

            <span>
              <i className="iconoir-clock" />
              Expires: {formatPlatformDateTime(session.impersonation.expiresAt)}
            </span>
          </div>
        </section>
      </section>
    </UserShell>
  );
}
