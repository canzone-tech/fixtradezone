"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminUser } from "@/lib/auth";
import styles from "./referrals.module.css";

interface ReferralConfig {
  enrollmentEnabled: boolean;
  existingUserMigrationMode: string;
  referralCodeMode: string;
  referralCodePrefix: string | null;
  referralCodePattern: string | null;
  adminSponsorChangeEnabled: boolean;
  primaryRootUserId: string | null;
  defaultSponsorUserId: string | null;
  updatedAt: string | null;
}

interface UsersPayload {
  users: AdminUser[];
}

interface ErrorPayload {
  message?: string;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function ReferralsClient() {
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSponsor, setSavingSponsor] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [enrollmentEnabled, setEnrollmentEnabled] = useState(false);
  const [adminSponsorChangeEnabled, setAdminSponsorChangeEnabled] = useState(false);
  const [defaultSponsorUserId, setDefaultSponsorUserId] = useState("");

  const [memberUserId, setMemberUserId] = useState("");
  const [sponsorUserId, setSponsorUserId] = useState("");
  const [reason, setReason] = useState("");

  const isSuperAdmin = actor?.roles.includes("SUPER_ADMIN") ?? false;
  const canManageSponsor =
    isSuperAdmin ||
    actor?.permissions.includes("referrals.sponsor.manage") === true;

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "ACTIVE"),
    [users],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Resolve/refresh the administrator browser session first. Other BFF
        // requests run only after this step so rotating refresh tokens cannot
        // be consumed concurrently when the access token has just expired.
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionPayload = await readPayload<
          { user?: AdminUser } & ErrorPayload
        >(sessionResponse);

        if (!sessionResponse.ok || !sessionPayload?.user) {
          throw new Error(
            sessionPayload?.message || "Unable to load administrator session.",
          );
        }

        const actorUser = sessionPayload.user;
        const usersResponse = await fetch("/api/admin/users?page=1&limit=100", {
          cache: "no-store",
        });
        const usersPayload = await readPayload<UsersPayload & ErrorPayload>(
          usersResponse,
        );

        if (!usersResponse.ok || !usersPayload?.users) {
          throw new Error(usersPayload?.message || "Unable to load users.");
        }

        let nextConfig: ReferralConfig | null = null;

        if (actorUser.roles.includes("SUPER_ADMIN")) {
          const configResponse = await fetch("/api/admin/referrals/config", {
            cache: "no-store",
          });
          const configPayload = await readPayload<ReferralConfig & ErrorPayload>(
            configResponse,
          );

          if (!configResponse.ok || !configPayload) {
            throw new Error(
              configPayload?.message || "Unable to load referral configuration.",
            );
          }

          nextConfig = configPayload;
        }

        if (mounted) {
          setActor(actorUser);
          setUsers(usersPayload.users);
          setConfig(nextConfig);

          if (nextConfig) {
            setEnrollmentEnabled(nextConfig.enrollmentEnabled);
            setAdminSponsorChangeEnabled(
              nextConfig.adminSponsorChangeEnabled,
            );
            setDefaultSponsorUserId(nextConfig.defaultSponsorUserId ?? "");
          }
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load referral management.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSuperAdmin || !config) {
      return;
    }

    setSavingConfig(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/referrals/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentEnabled,
          adminSponsorChangeEnabled,
          defaultSponsorUserId: defaultSponsorUserId || undefined,
        }),
      });

      const payload = await readPayload<
        (ReferralConfig & { message?: string }) | ErrorPayload
      >(response);

      if (!response.ok || !payload || !("enrollmentEnabled" in payload)) {
        throw new Error(
          payload?.message || "Unable to update referral configuration.",
        );
      }

      setConfig(payload);
      setEnrollmentEnabled(payload.enrollmentEnabled);
      setAdminSponsorChangeEnabled(payload.adminSponsorChangeEnabled);
      setDefaultSponsorUserId(payload.defaultSponsorUserId ?? "");
      setSuccess(payload.message || "Referral configuration updated.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update referral configuration.",
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function changeSponsor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canManageSponsor ||
      !memberUserId ||
      !sponsorUserId ||
      reason.trim().length < 3
    ) {
      return;
    }

    setSavingSponsor(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/admin/referrals/${encodeURIComponent(memberUserId)}/sponsor`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sponsorUserId,
            reason: reason.trim(),
          }),
        },
      );

      const payload = await readPayload<{ message?: string } & ErrorPayload>(
        response,
      );

      if (!response.ok) {
        throw new Error(
          payload?.message || "Unable to update referral sponsor.",
        );
      }

      setSuccess(payload?.message || "Referral sponsor updated.");
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update referral sponsor.",
      );
    } finally {
      setSavingSponsor(false);
    }
  }

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading referral controls…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>MLM FOUNDATION</span>
          <h2>Referral Management</h2>
          <p>
            Manage referral enrollment and audited sponsor changes without
            bypassing backend RBAC.
          </p>
        </div>
        <div className={styles.roleBadge}>
          {isSuperAdmin ? "SUPER_ADMIN" : "ADMIN"}
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {success ? <div className={styles.successBanner}>{success}</div> : null}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <small>SYSTEM CONFIGURATION</small>
              <h3>Referral enrollment</h3>
            </div>
            <i className="iconoir-settings" />
          </div>

          {!isSuperAdmin ? (
            <div className={styles.restricted}>
              <i className="iconoir-lock" />
              <strong>SUPER_ADMIN only</strong>
              <p>
                Global referral configuration is intentionally restricted to the
                founder authority.
              </p>
            </div>
          ) : config ? (
            <form className={styles.form} onSubmit={saveConfig}>
              <label className={styles.switchRow}>
                <span>
                  <strong>Enrollment enabled</strong>
                  <small>New registrations can enter the referral tree.</small>
                </span>
                <input
                  type="checkbox"
                  checked={enrollmentEnabled}
                  onChange={(event) =>
                    setEnrollmentEnabled(event.target.checked)
                  }
                />
              </label>

              <label className={styles.switchRow}>
                <span>
                  <strong>Delegated ADMIN sponsor changes</strong>
                  <small>
                    Requires referrals.sponsor.manage permission as well.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={adminSponsorChangeEnabled}
                  onChange={(event) =>
                    setAdminSponsorChangeEnabled(event.target.checked)
                  }
                />
              </label>

              <label>
                <span>Default sponsor</span>
                <select
                  value={defaultSponsorUserId}
                  onChange={(event) =>
                    setDefaultSponsorUserId(event.target.value)
                  }
                >
                  <option value="">Select an active enrolled user</option>
                  {activeUsers.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.username} — {user.email ?? user.id}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.readOnlyGrid}>
                <div>
                  <small>PRIMARY ROOT</small>
                  <strong>{config.primaryRootUserId ?? "Not configured"}</strong>
                </div>
                <div>
                  <small>CODE MODE</small>
                  <strong>{config.referralCodeMode}</strong>
                </div>
                <div>
                  <small>MIGRATION MODE</small>
                  <strong>{config.existingUserMigrationMode}</strong>
                </div>
              </div>

              <button type="submit" disabled={savingConfig}>
                {savingConfig ? "Saving…" : "Save configuration"}
              </button>
            </form>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <small>AUDITED OPERATION</small>
              <h3>Assign / reassign sponsor</h3>
            </div>
            <i className="iconoir-community" />
          </div>

          {!canManageSponsor ? (
            <div className={styles.restricted}>
              <i className="iconoir-shield-xmark" />
              <strong>Permission required</strong>
              <p>
                Your ADMIN role does not currently include
                referrals.sponsor.manage.
              </p>
            </div>
          ) : (
            <form className={styles.form} onSubmit={changeSponsor}>
              <label>
                <span>Member</span>
                <select
                  required
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                >
                  <option value="">Select member</option>
                  {activeUsers.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.username} — {user.email ?? user.id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>New sponsor</span>
                <select
                  required
                  value={sponsorUserId}
                  onChange={(event) => setSponsorUserId(event.target.value)}
                >
                  <option value="">Select sponsor</option>
                  {activeUsers
                    .filter((user) => user.id !== memberUserId)
                    .map((user) => (
                      <option value={user.id} key={user.id}>
                        {user.username} — {user.email ?? user.id}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                <span>Reason</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why this sponsor change is required."
                />
              </label>

              <p className={styles.auditNote}>
                <i className="iconoir-journal-page" /> Actor, previous sponsor,
                new sponsor, reason and request context are audited by the
                backend.
              </p>

              <button
                type="submit"
                disabled={
                  savingSponsor ||
                  !memberUserId ||
                  !sponsorUserId ||
                  reason.trim().length < 3
                }
              >
                {savingSponsor ? "Updating…" : "Update sponsor"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
