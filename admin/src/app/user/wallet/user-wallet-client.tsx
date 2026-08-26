"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/wallet/wallet.module.css";
import type { UserDirectSession } from "@/lib/user-session";
import {
  type ApiMessagePayload,
  type UserWalletResponse,
  compactDecimal,
  formatWalletDate,
  messageFrom,
  readJson,
} from "@/lib/wallet";

interface UserApiMessagePayload extends ApiMessagePayload {
  redirectTo?: string | null;
}

class UserWalletAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserWalletAccessError";
  }
}

async function checkedUserJson<T extends UserApiMessagePayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);
  if (response.status === 401 || response.status === 403) {
    throw new UserWalletAccessError(
      messageFrom(payload, fallback),
      response.status,
      payload?.redirectTo ?? null,
    );
  }
  if (!response.ok || !payload) {
    throw new Error(messageFrom(payload, fallback));
  }
  return payload;
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserWalletAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

async function fetchWalletWorkspace(): Promise<{
  session: UserDirectSession;
  wallet: UserWalletResponse;
}> {
  const sessionResponse = await fetch("/api/user/session", { cache: "no-store" });
  const session = await checkedUserJson<
    UserDirectSession & UserApiMessagePayload
  >(sessionResponse, "USER session is unavailable.");
  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  const walletResponse = await fetch("/api/user/wallet?limit=50", {
    cache: "no-store",
  });
  const wallet = await checkedUserJson<UserWalletResponse & UserApiMessagePayload>(
    walletResponse,
    "Could not load wallet accounting.",
  );

  return { session, wallet };
}

export default function UserWalletClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [wallet, setWallet] = useState<UserWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const workspace = await fetchWalletWorkspace();
      setSession(workspace.session);
      setWallet(workspace.wallet);
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not load wallet accounting.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const workspace = await fetchWalletWorkspace();
        if (!mounted) return;
        setSession(workspace.session);
        setWallet(workspace.wallet);
      } catch (caught) {
        if (!mounted) return;
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load wallet accounting.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      mounted = false;
    };
  }, [router]);

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
          <p className={styles.eyebrow}>WAL-01 / ACCOUNTING WALLET</p>
          <h1>My Wallet</h1>
          <p>
            Total Wallet is derived from immutable accounting buckets. Simulated
            activity is never counted as wallet money, and package earnings,
            referral commission, and rewards remain zero until their own approved
            milestones post real ledger events.
          </p>
        </section>

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading wallet accounting…</div>
          </section>
        ) : wallet && wallet.wallets.length > 0 ? (
          wallet.wallets.map((summary) => (
            <section className={styles.card} key={summary.currency}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Currency Wallet</p>
                  <h2>{summary.currency}</h2>
                </div>
                <span className={styles.badge} data-tone="success">
                  Ledger-backed
                </span>
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric} data-primary="true">
                  <small>Total Wallet</small>
                  <strong>
                    {compactDecimal(summary.totalWallet)} {summary.currency}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <small>Main / Deposit</small>
                  <strong>
                    {compactDecimal(summary.buckets.main)} {summary.currency}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <small>Package Earnings</small>
                  <strong>
                    {compactDecimal(summary.buckets.packageEarnings)} {summary.currency}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <small>Referral Commission</small>
                  <strong>
                    {compactDecimal(summary.buckets.referralCommission)} {summary.currency}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <small>Rewards</small>
                  <strong>
                    {compactDecimal(summary.buckets.rewards)} {summary.currency}
                  </strong>
                </div>
              </div>
            </section>
          ))
        ) : (
          <section className={styles.card}>
            <div className={styles.empty}>
              No wallet accounting has been posted yet. Approved deposits appear here
              only after controlled ledger posting.
            </div>
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable History</p>
              <h2>Wallet activity</h2>
            </div>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void reload()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {!wallet || wallet.activity.length === 0 ? (
            <div className={styles.empty}>No posted ledger activity yet.</div>
          ) : (
            <div className={styles.list}>
              {wallet.activity.map((activity) => (
                <div className={styles.row} key={`${activity.transactionId}-${activity.bucket}`}>
                  <div className={styles.rowTop}>
                    <div>
                      <strong>{activity.description}</strong>
                      <span className={styles.meta}>
                        {formatWalletDate(activity.postedAt)} · {activity.bucket}
                      </span>
                    </div>
                    <span className={styles.badge} data-tone="success">
                      +{compactDecimal(activity.amount)} {activity.currency}
                    </span>
                  </div>
                  <span className={`${styles.meta} ${styles.mono}`}>
                    {activity.transactionId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
