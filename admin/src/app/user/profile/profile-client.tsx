"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./profile.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

interface ProfileUpdatePayload extends ErrorPayload {
  user?: UserDirectSession["user"];
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

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
          setFirstName(payload.user.firstName ?? "");
          setLastName(payload.user.lastName ?? "");
          setPhone(payload.user.phone ?? "");
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/user/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
        }),
      });
      const payload = await readPayload<ProfileUpdatePayload>(response);

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok || !payload?.user) {
        throw new Error(payload?.message || "Unable to update your profile.");
      }

      setSession((current) =>
        current
          ? {
              ...current,
              user: payload.user as UserDirectSession["user"],
            }
          : current,
      );
      setFirstName(payload.user.firstName ?? "");
      setLastName(payload.user.lastName ?? "");
      setPhone(payload.user.phone ?? "");
      setSaveMessage(payload.message ?? "Profile updated successfully.");
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Unable to update your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

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
              Your registration identity is intentionally minimal. First name,
              last name and mobile are optional and can be maintained here.
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
                <span>OPTIONAL PROFILE</span>
                <h3>Personal Details</h3>
              </div>
              <i className="iconoir-edit-pencil" />
            </div>

            <form className={styles.profileForm} onSubmit={saveProfile}>
              <div className={styles.formGrid}>
                <label>
                  <span>First name</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    maxLength={100}
                    autoComplete="given-name"
                    placeholder="Optional"
                    disabled={saving}
                  />
                </label>

                <label>
                  <span>Last name</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    maxLength={100}
                    autoComplete="family-name"
                    placeholder="Optional"
                    disabled={saving}
                  />
                </label>
              </div>

              <label>
                <span>Mobile</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={16}
                  autoComplete="tel"
                  placeholder="Optional · E.164, e.g. +919876543210"
                  disabled={saving}
                />
              </label>

              <p className={styles.formHint}>
                These fields are optional. Leave a field blank and save to clear
                it. Email and username remain account identifiers and are not
                changed here.
              </p>

              {saveError ? (
                <div className={styles.formError} role="alert">
                  {saveError}
                </div>
              ) : null}
              {saveMessage ? (
                <div className={styles.formSuccess}>{saveMessage}</div>
              ) : null}

              <button type="submit" disabled={saving}>
                <span>{saving ? "Saving…" : "Save optional details"}</span>
                <i className="iconoir-check" />
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>ACCOUNT</span>
                <h3>Identity Details</h3>
              </div>
              <i className="iconoir-profile-circle" />
            </div>

            <dl className={styles.details}>
              <div>
                <dt>Display Name</dt>
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
                <dt>Mobile</dt>
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
        </div>

        <section className={styles.notice}>
          <span>
            <i className="iconoir-shield-check" />
          </span>
          <div>
            <strong>Protected account boundary</strong>
            <p>
              Optional profile updates are authenticated, validated server-side
              and audited. Profile changes are disabled during administrator
              impersonation.
            </p>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
