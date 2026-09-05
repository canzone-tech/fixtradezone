"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/closeout/closeout.module.css";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";

interface UserApiPayload {
  message?: string;
  redirectTo?: string | null;
}

interface CommissionBalance {
  currency: string;
  referralCommission: string;
}

interface CommissionEvent {
  id: string;
  purchaserUsername?: string;
  sourcePackageDisplayName?: string;
  level: number;
  currency: string;
  sourcePackageValue: string;
  receiverPackageBasis: string;
  eligibleBase: string;
  ratePercent: string;
  commissionAmount: string;
  releaseMode: string;
  status: "AVAILABLE" | "PENDING" | "LOST";
  ineligibilityReason: string | null;
  ledgerTransactionId: string | null;
  availableAt: string | null;
  createdAt: string;
}

interface CommissionResponse extends UserApiPayload {
  balances: CommissionBalance[];
  events: CommissionEvent[];
  page: number;
  limit: number;
  total: number;
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

function compactDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function statusTone(status: CommissionEvent["status"]): "success" | "warning" | undefined {
  if (status === "AVAILABLE") return "success";
  if (status === "PENDING") return "warning";
  return undefined;
}

export default function UserCommissionsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [data, setData] = useState<CommissionResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);

      try {
        // Validate/refresh the USER session first. Keeping this sequential avoids
        // concurrent refresh-token rotation across multiple USER BFF requests.
        const sessionResponse = await fetch("/api/user/session", {
          cache: "no-store",
        });
        const nextSession = await checked<UserDirectSession & UserApiPayload>(
          sessionResponse,
          "USER session is unavailable.",
        );

        const commissionsResponse = await fetch(
          `/api/user/commissions?page=${nextPage}&limit=50`,
          { cache: "no-store" },
        );
        const commissions = await checked<CommissionResponse>(
          commissionsResponse,
          "Could not load referral commissions.",
        );

        setSession(nextSession);
        setData(commissions);
        setPage(commissions.page);
      } catch (caught) {
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load referral commissions.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

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

        <section className={styles.hero}>
          <p className={styles.eyebrow}>COMM-01 / USER COMMISSIONS</p>
          <h1>Referral Commissions</h1>
          <p>
            View ledger-backed referral commission balances and immutable
            commission events generated from package activity.
          </p>
        </section>

        <section className={styles.card}>
          <p className={styles.eyebrow}>Commission Wallet</p>
          <h2>Available balances</h2>
          {loading && !data ? (
            <div className={styles.empty}>Loading commission balances…</div>
          ) : data?.balances.length ? (
            <div className={styles.grid}>
              {data.balances.map((balance) => (
                <div className={styles.metric} key={balance.currency}>
                  <small>{balance.currency}</small>
                  <strong>
                    {compactDecimal(balance.referralCommission)} {balance.currency}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              No referral commission balance exists yet.
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable History</p>
              <h2>Commission events</h2>
              <p>{data?.total ?? 0} event(s)</p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={loading || page <= 1}
                onClick={() => void load(page - 1)}
              >
                Previous
              </button>
              <span className={styles.meta}>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={loading || page >= totalPages}
                onClick={() => void load(page + 1)}
              >
                Next
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div className={styles.empty}>Loading commission history…</div>
          ) : !data?.events.length ? (
            <div className={styles.empty}>No commission events to show.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Level</th>
                    <th>Source User</th>
                    <th>Eligible Base</th>
                    <th>Rate</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.sourcePackageDisplayName ?? "Package"}</strong>
                        <div className={styles.meta}>
                          Source {compactDecimal(event.sourcePackageValue)} {event.currency}
                        </div>
                      </td>
                      <td>L{event.level}</td>
                      <td>{event.purchaserUsername ?? "—"}</td>
                      <td>
                        {compactDecimal(event.eligibleBase)} {event.currency}
                      </td>
                      <td>{compactDecimal(event.ratePercent)}%</td>
                      <td>
                        <strong>
                          {compactDecimal(event.commissionAmount)} {event.currency}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={statusTone(event.status)}
                        >
                          {event.status}
                        </span>
                        {event.ineligibilityReason ? (
                          <div className={styles.meta}>{event.ineligibilityReason}</div>
                        ) : null}
                      </td>
                      <td>
                        {formatPlatformDateTime(event.availableAt ?? event.createdAt)}
                      </td>
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
