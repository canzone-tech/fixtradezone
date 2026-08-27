"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { MyCommissionsResponse } from "@/lib/commissions";
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

function amountLabel(value: string, currency: string) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UserReferralsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [direct, setDirect] = useState<DirectResponse | null>(null);
  const [commissions, setCommissions] = useState<MyCommissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Validate/refresh the browser session first. Business-data requests are
        // intentionally issued only after this completes so rotating refresh
        // tokens cannot be consumed concurrently by multiple BFF requests.
        const sessionResponse = await fetch("/api/user/session", {
          cache: "no-store",
        });
        const sessionPayload = await readPayload<UserDirectSession & ErrorPayload>(
          sessionResponse,
        );

        if (sessionResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (sessionResponse.status === 403) {
          router.replace(
            sessionPayload?.redirectTo === "/dashboard"
              ? "/dashboard"
              : "/login",
          );
          router.refresh();
          return;
        }

        if (
          !sessionResponse.ok ||
          !sessionPayload?.user ||
          !sessionPayload.sessionPolicy
        ) {
          throw new Error(sessionPayload?.message || "Unable to load USER session.");
        }

        const [profileResponse, directResponse, commissionResponse] = await Promise.all([
          fetch("/api/user/referrals", { cache: "no-store" }),
          fetch("/api/user/referrals/direct?page=1&limit=20", {
            cache: "no-store",
          }),
          fetch("/api/user/commissions?page=1&limit=50", {
            cache: "no-store",
          }),
        ]);

        if (
          profileResponse.status === 401 ||
          directResponse.status === 401 ||
          commissionResponse.status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const profilePayload = await readPayload<ReferralProfile & ErrorPayload>(
          profileResponse,
        );
        const directPayload = await readPayload<DirectResponse & ErrorPayload>(
          directResponse,
        );
        const commissionPayload = await readPayload<
          MyCommissionsResponse & ErrorPayload
        >(commissionResponse);

        if (!profileResponse.ok || !profilePayload) {
          throw new Error(
            profilePayload?.message || "Unable to load referral profile.",
          );
        }

        if (!directResponse.ok || !directPayload) {
          throw new Error(
            directPayload?.message || "Unable to load direct referrals.",
          );
        }

        if (!commissionResponse.ok || !commissionPayload) {
          throw new Error(
            commissionPayload?.message || "Unable to load referral commissions.",
          );
        }

        if (mounted) {
          setSession(sessionPayload);
          setProfile(profilePayload);
          setDirect(directPayload);
          setCommissions(commissionPayload);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load referrals.",
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
  }, [router]);

  async function copyInviteLink() {
    if (!profile?.referralCode) return;

    const inviteUrl = new URL("/register", window.location.origin);
    inviteUrl.searchParams.set("ref", profile.referralCode);

    await navigator.clipboard.writeText(inviteUrl.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading referral workspace…</p>
        </div>
      </UserShell>
    );
  }

  if (!session || !profile || !direct || !commissions) {
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
            <span>NETWORK + COMMISSIONS</span>
            <h2>My Referrals</h2>
            <p>
              Referral identity, direct network and ledger-backed commission history.
            </p>
          </div>
          <div className={styles.status}>{profile.assignmentStatus}</div>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.primaryCard}>
            <div className={styles.cardIcon}>
              <i className="iconoir-community" />
            </div>
            <small>MY REFERRAL CODE</small>
            <strong>{profile.referralCode ?? "Not assigned"}</strong>
            <p>
              {profile.enrolled
                ? "Share your invite link so new members register under your referral code."
                : "Referral enrollment is not available for this account yet."}
            </p>
            <button
              type="button"
              onClick={() => void copyInviteLink()}
              disabled={!profile.referralCode}
            >
              <i className="iconoir-copy" />
              {copied ? "Invite link copied" : "Copy invite link"}
            </button>
          </article>

          <article className={styles.infoCard}>
            <small>DIRECT REFERRALS</small>
            <strong>{direct.pagination.total}</strong>
            <span>Level 1 members</span>
          </article>

          <article className={styles.infoCard}>
            <small>SPONSOR</small>
            <strong>
              {profile.sponsor
                ? displayName(profile.sponsor)
                : profile.assignmentStatus === "ROOT"
                  ? "ROOT ACCOUNT"
                  : "Not assigned"}
            </strong>
            <span>
              {profile.sponsor
                ? `@${profile.sponsor.username}`
                : "Referral hierarchy"}
            </span>
          </article>
        </section>

        <section className={styles.commissionBalances}>
          <div className={styles.tableHead}>
            <div>
              <span>LEDGER BALANCE</span>
              <h3>Referral Commission</h3>
            </div>
            <b>{commissions.total} immutable event(s)</b>
          </div>
          <div className={styles.balanceGrid}>
            {commissions.balances.length === 0 ? (
              <article className={styles.balanceCard}>
                <small>NO AVAILABLE COMMISSION</small>
                <strong>0.00</strong>
                <span>Only settled ledger-backed commission appears here.</span>
              </article>
            ) : (
              commissions.balances.map((balance) => (
                <article className={styles.balanceCard} key={balance.currency}>
                  <small>{balance.currency} · AVAILABLE</small>
                  <strong>
                    {amountLabel(balance.referralCommission, balance.currency)}
                  </strong>
                  <span>Referral Commission wallet bucket</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <div>
              <span>IMMUTABLE HISTORY</span>
              <h3>Commission events</h3>
            </div>
            <b>{commissions.total} total</b>
          </div>

          {commissions.events.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="iconoir-coins" />
              <strong>No referral commission events yet</strong>
              <p>
                Earned commissions appear only after an eligible ACTIVE package
                subscription is processed under an effective published plan.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Source member</th>
                    <th>Package</th>
                    <th>Level</th>
                    <th>Eligible base</th>
                    <th>Rate</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.events.map((event) => (
                    <tr key={event.id}>
                      <td>@{event.purchaserUsername ?? event.purchaserUserId}</td>
                      <td>{event.sourcePackageDisplayName ?? "Package"}</td>
                      <td>L{event.level}</td>
                      <td>{amountLabel(event.eligibleBase, event.currency)}</td>
                      <td>{event.ratePercent}%</td>
                      <td>{amountLabel(event.commissionAmount, event.currency)}</td>
                      <td><span className={styles.badge}>{event.status}</span></td>
                      <td>{dateLabel(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              <p>
                Your direct referrals will appear here after they register under
                your referral code.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th>Referral state</th>
                    <th>Joined</th>
                  </tr>
                </thead>
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
