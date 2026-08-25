"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./user-referrals.module.css";

interface ReferralProfile {
  enrolled: boolean;
  assignmentStatus: "ROOT" | "ASSIGNED" | "UNASSIGNED";
  referralCode: string | null;
  sponsor: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
  } | null;
  assignedAt?: string | null;
}

interface DirectReferral {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  assignmentStatus: string;
  assignedAt: string | null;
  referralJoinedAt: string;
}

interface DirectResponse {
  items: DirectReferral[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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

function displayName(user: {
  username: string;
  firstName: string | null;
  lastName: string | null;
}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

export default function UserReferralsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [direct, setDirect] = useState<DirectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [sessionResponse, profileResponse, directResponse] = await Promise.all([
          fetch("/api/user/session", { cache: "no-store" }),
          fetch("/api/user/referrals", { cache: "no-store" }),
          fetch("/api/user/referrals/direct?page=1&limit=20", { cache: "no-store" }),
        ]);

        const sessionPayload = await readPayload<UserDirectSession & ErrorPayload>(sessionResponse);

        if (sessionResponse.status === 401 || profileResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (sessionResponse.status === 403) {
          router.replace(sessionPayload?.redirectTo === "/dashboard" ? "/dashboard" : "/login");
          router.refresh();
          return;
        }

        const profilePayload = await readPayload<ReferralProfile & ErrorPayload>(profileResponse);
        const directPayload = await readPayload<DirectResponse & ErrorPayload>(directResponse);

        if (!sessionResponse.ok || !sessionPayload?.user || !sessionPayload.sessionPolicy) {
          throw new Error(sessionPayload?.message || "Unable to load USER session.");
        }

        if (!profileResponse.ok || !profilePayload) {
          throw new Error(profilePayload?.message || "Unable to load referral profile.");
        }

        if (!directResponse.ok || !directPayload) {
          throw new Error(directPayload?.message || "Unable to load direct referrals.");
        }

        if (mounted) {
          setSession(sessionPayload);
          setProfile(profilePayload);
          setDirect(directPayload);
        }
      } catch (caught) {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : "Unable to load referrals.");
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
  }, [router]);

  async function copyCode() {
    if (!profile?.referralCode) {
      return;
    }

    await navigator.clipboard.writeText(profile.referralCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading"><span /><p>Loading referral workspace…</p></div>
      </UserShell>
    );
  }

  if (!session || !profile || !direct) {
    return (
      <UserShell session={session}>
        <div className={styles.errorState}>
          <i className="iconoir-warning-triangle" />
          <strong>Referral workspace unavailable</strong>
          <p>{error || "Unable to load referral information."}</p>
        </div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span>NETWORK</span>
            <h2>My Referrals</h2>
            <p>Your referral identity and direct network are loaded from the live referral API.</p>
          </div>
          <div className={styles.status}>{profile.assignmentStatus}</div>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.primaryCard}>
            <div className={styles.cardIcon}><i className="iconoir-community" /></div>
            <small>MY REFERRAL CODE</small>
            <strong>{profile.referralCode ?? "Not assigned"}</strong>
            <p>{profile.enrolled ? "Use this code when inviting a new member." : "Referral enrollment is not available for this account yet."}</p>
            <button type="button" onClick={() => void copyCode()} disabled={!profile.referralCode}>
              <i className="iconoir-copy" /> {copied ? "Copied" : "Copy code"}
            </button>
          </article>

          <article className={styles.infoCard}>
            <small>DIRECT REFERRALS</small>
            <strong>{direct.pagination.total}</strong>
            <span>Level 1 members</span>
          </article>

          <article className={styles.infoCard}>
            <small>SPONSOR</small>
            <strong>{profile.sponsor ? displayName(profile.sponsor) : profile.assignmentStatus === "ROOT" ? "ROOT ACCOUNT" : "Not assigned"}</strong>
            <span>{profile.sponsor ? `@${profile.sponsor.username}` : "Referral hierarchy"}</span>
          </article>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <div>
              <span>LEVEL 1</span>
              <h3>Direct referral network</h3>
            </div>
            <b>{direct.pagination.total} total</b>
          </div>

          {direct.items.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="iconoir-community" />
              <strong>No direct referrals yet</strong>
              <p>Your direct referrals will appear here after they register under your referral code.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Member</th><th>Username</th><th>Status</th><th>Referral state</th><th>Joined</th></tr></thead>
                <tbody>
                  {direct.items.map((member) => (
                    <tr key={member.id}>
                      <td>{displayName(member)}</td>
                      <td>@{member.username}</td>
                      <td><span className={styles.badge}>{member.status}</span></td>
                      <td>{member.assignmentStatus}</td>
                      <td>{new Date(member.referralJoinedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
