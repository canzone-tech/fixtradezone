"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./profile.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDate(value: string | null): string {
  return value ? formatPlatformDateTime(value) : "No login recorded";
}

export default function UserProfileClient() {
  const router = useRouter();

  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await readPayload<UserDirectSession & ErrorPayload>(
          response,
        );

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (response.status === 403) {
          router.replace(
            payload?.redirectTo === "/dashboard" ? "/dashboard" : "/login",
          );
          router.refresh();
          return;
        }

        if (!response.ok || !payload?.user || !payload.sessionPolicy) {
          throw new Error(payload?.message || "Unable to load your profile.");
        }

        if (mounted) {
          setSession(payload);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your profile.",
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

  const displayName = useMemo(() => {
    const user = session?.user;

    if (!user) {
      return "FixTradeZone User";
    }

    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "FixTradeZone User"
    );
  }, [session]);

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading account profile…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.error}>
          {error || "USER profile is unavailable."}
        </div>
      </UserShell>
    );
  }

  const user = session.user;

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>ACCOUNT & SECURITY</span>

            <h2>{displayName}</h2>

            <p>
              Review your FixTradeZone identity, account status and
              authenticated session information.
            </p>

            <div className={styles.badges}>
              <span>
                <i className="iconoir-shield-check" />
                {user.status}
              </span>

              {user.roles.map((role) => (
                <span key={role}>
                  <i className="iconoir-user" />
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.profileMark}>
            <i className="iconoir-profile-circle" />
          </div>
        </section>

        <section className={styles.metrics}>
          <article>
            <span>
              <i className="iconoir-user" />
            </span>

            <div>
              <small>ACCOUNT STATUS</small>
              <strong>{user.status}</strong>
            </div>
          </article>

          <article>
            <span>
              <i className="iconoir-key" />
            </span>

            <div>
              <small>ACCESS ROLE</small>
              <strong>USER</strong>
            </div>
          </article>

          <article>
            <span>
              <i className="iconoir-clock" />
            </span>

            <div>
              <small>LAST LOGIN</small>
              <strong>{formatDate(user.lastLoginAt)}</strong>
            </div>
          </article>

          <article>
            <span>
              <i className="iconoir-timer" />
            </span>

            <div>
              <small>IDLE SECURITY</small>
              <strong>{session.sessionPolicy.idleLockMinutes} MIN</strong>
            </div>
          </article>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>PROFILE</span>
                <h3>Account Details</h3>
              </div>

              <i className="iconoir-profile-circle" />
            </div>

            <dl className={styles.details}>
              <div>
                <dt>Full Name</dt>
                <dd>{displayName}</dd>
              </div>

              <div>
                <dt>Username</dt>
                <dd>@{user.username}</dd>
              </div>

              <div>
                <dt>Email</dt>
                <dd>{user.email || "Not set"}</dd>
              </div>

              <div>
                <dt>Phone</dt>
                <dd>{user.phone || "Not set"}</dd>
              </div>

              <div>
                <dt>Created</dt>
                <dd>{formatPlatformDateTime(user.createdAt)}</dd>
              </div>

              <div>
                <dt>Last Login</dt>
                <dd>{formatDate(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>SECURITY</span>
                <h3>Session Status</h3>
              </div>

              <i className="iconoir-shield-check" />
            </div>

            <div className={styles.securityState}>
              <span />

              <div>
                <strong>Authenticated USER session active</strong>

                <p>
                  Access and refresh credentials remain in secure HttpOnly
                  cookies. Backend authorization remains the source of truth.
                </p>
              </div>
            </div>

            <div className={styles.securityFacts}>
              <div>
                <small>SESSION TYPE</small>
                <strong>STANDARD USER</strong>
              </div>

              <div>
                <small>IDLE LOCK</small>
                <strong>{session.sessionPolicy.idleLockMinutes} MINUTES</strong>
              </div>
            </div>
          </section>
        </div>

        <section className={styles.notice}>
          <span>
            <i className="iconoir-shield-check" />
          </span>

          <div>
            <strong>Protected account boundary</strong>

            <p>
              This page uses the dedicated standard USER session API. ADMIN and
              SUPER_ADMIN sessions are rejected from this USER boundary and
              routed to the administrator portal.
            </p>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
