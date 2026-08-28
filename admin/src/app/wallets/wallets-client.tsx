"use client";

import { useEffect, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/wallet/wallet.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  type AdminLedgerResponse,
  type AdminWalletsResponse,
  type ApiMessagePayload,
  type LedgerDetailResponse,
  type LedgerMutationResponse,
  type LedgerTransaction,
  type ReconciliationResponse,
  type UnpostedApprovedDeposit,
  compactDecimal,
  formatWalletDate,
  messageFrom,
  readJson,
} from "@/lib/wallet";

interface AdminWalletWorkspace {
  user: AdminUser;
  wallets: AdminWalletsResponse;
  ledger: AdminLedgerResponse;
  reconciliation: ReconciliationResponse;
}

function isSuperAdmin(user: AdminUser): boolean {
  return user.roles.includes("SUPER_ADMIN");
}

function hasPermission(user: AdminUser, permission: string): boolean {
  return isSuperAdmin(user) || user.permissions.includes(permission);
}

async function checkedJson<T extends ApiMessagePayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);
  if (!response.ok || !payload) {
    throw new Error(messageFrom(payload, fallback));
  }
  return payload;
}

async function fetchAdminWalletWorkspace(): Promise<AdminWalletWorkspace> {
  const session = await resolveAdminSession();
  if (!session.user) {
    throw new Error(session.message ?? "Administrator session is unavailable.");
  }

  const user = session.user;
  const canReadWallets = hasPermission(user, "wallets.read");
  const canReadLedger = hasPermission(user, "ledger.read");
  const canPostLedger = hasPermission(user, "ledger.post");

  const wallets: AdminWalletsResponse = canReadWallets
    ? await checkedJson<AdminWalletsResponse & ApiMessagePayload>(
        await fetch("/api/admin/wallets?limit=50", { cache: "no-store" }),
        "Could not load wallet balances.",
      )
    : { page: 1, limit: 50, total: 0, wallets: [] };

  const ledger: AdminLedgerResponse = canReadLedger
    ? await checkedJson<AdminLedgerResponse & ApiMessagePayload>(
        await fetch("/api/admin/ledger?limit=50", { cache: "no-store" }),
        "Could not load ledger transactions.",
      )
    : { page: 1, limit: 50, total: 0, transactions: [] };

  const reconciliation: ReconciliationResponse = canPostLedger
    ? await checkedJson<ReconciliationResponse & ApiMessagePayload>(
        await fetch("/api/admin/wallets/reconciliation?limit=50", {
          cache: "no-store",
        }),
        "Could not load approved deposits pending accounting.",
      )
    : { page: 1, limit: 50, total: 0, deposits: [] };

  return { user, wallets, ledger, reconciliation };
}

export default function WalletsClient() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [wallets, setWallets] = useState<AdminWalletsResponse>({
    page: 1,
    limit: 50,
    total: 0,
    wallets: [],
  });
  const [ledger, setLedger] = useState<AdminLedgerResponse>({
    page: 1,
    limit: 50,
    total: 0,
    transactions: [],
  });
  const [reconciliation, setReconciliation] = useState<ReconciliationResponse>({
    page: 1,
    limit: 50,
    total: 0,
    deposits: [],
  });
  const [selectedLedger, setSelectedLedger] = useState<LedgerDetailResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReadWallets = user !== null && hasPermission(user, "wallets.read");
  const canReadLedger = user !== null && hasPermission(user, "ledger.read");
  const canPostLedger = user !== null && hasPermission(user, "ledger.post");
  const currencyCount = new Set(wallets.wallets.map((wallet) => wallet.currency)).size;

  function applyWorkspace(workspace: AdminWalletWorkspace) {
    setUser(workspace.user);
    setWallets(workspace.wallets);
    setLedger(workspace.ledger);
    setReconciliation(workspace.reconciliation);
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      applyWorkspace(await fetchAdminWalletWorkspace());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load wallet accounting workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const workspace = await fetchAdminWalletWorkspace();
        if (mounted) applyWorkspace(workspace);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load wallet accounting workspace.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      mounted = false;
    };
  }, []);

  async function postAccounting(deposit: UnpostedApprovedDeposit) {
    setBusy(`post-${deposit.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/deposits/${deposit.id}/post-accounting`,
        { method: "POST" },
      );
      const payload = await checkedJson<LedgerMutationResponse & ApiMessagePayload>(
        response,
        "Could not post approved deposit into accounting.",
      );
      setNotice(payload.message);
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not post approved deposit into accounting.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function inspectLedger(transaction: LedgerTransaction) {
    setBusy(`ledger-${transaction.id}`);
    setError(null);
    try {
      const payload = await checkedJson<LedgerDetailResponse & ApiMessagePayload>(
        await fetch(`/api/admin/ledger/${transaction.id}`, { cache: "no-store" }),
        "Could not load ledger transaction details.",
      );
      setSelectedLedger(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load ledger transaction details.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      {notice ? (
        <FlashMessage
          message={notice}
          type="success"
          onClose={() => setNotice(null)}
          autoDismissMs={5000}
        />
      ) : null}
      {error ? (
        <FlashMessage message={error} type="error" onClose={() => setError(null)} />
      ) : null}

      <section className={styles.hero}>
        <p className={styles.eyebrow}>WAL-01 / DOUBLE-ENTRY ACCOUNTING</p>
        <h1>Wallets & Ledger</h1>
        <p>
          Review USER wallet buckets, reconcile approved deposits into immutable
          double-entry accounting, and inspect balanced deposit, package funding,
          referral commission, and package reward ledger entries.
        </p>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Accounting Pending</p>
              <h2>{reconciliation.total} approved deposits</h2>
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

          {!canPostLedger ? (
            <div className={styles.notice}>Ledger posting permission is required.</div>
          ) : reconciliation.deposits.length === 0 ? (
            <div className={styles.empty}>No approved deposits are waiting for accounting.</div>
          ) : (
            <div className={styles.list}>
              {reconciliation.deposits.map((deposit) => (
                <div className={styles.row} key={deposit.id}>
                  <div className={styles.rowTop}>
                    <div>
                      <strong>
                        {deposit.username} · {deposit.packageDisplayName}
                      </strong>
                      <span className={styles.meta}>
                        {compactDecimal(deposit.amount)} {deposit.currency} · {deposit.assignedNetwork}
                      </span>
                    </div>
                    <span className={styles.badge} data-tone="warning">
                      Accounting pending
                    </span>
                  </div>
                  <span className={`${styles.meta} ${styles.mono}`}>
                    Deposit {deposit.id}
                  </span>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => void postAccounting(deposit)}
                      disabled={busy !== null}
                    >
                      {busy === `post-${deposit.id}` ? "Posting…" : "Post accounting"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Control Totals</p>
              <h2>Accounting state</h2>
            </div>
          </div>
          <div className={styles.metrics}>
            <div className={styles.metric} data-primary="true">
              <small>Wallet rows</small>
              <strong>{wallets.total}</strong>
            </div>
            <div className={styles.metric}>
              <small>Currencies</small>
              <strong>{currencyCount}</strong>
            </div>
            <div className={styles.metric}>
              <small>Ledger transactions</small>
              <strong>{ledger.total}</strong>
            </div>
            <div className={styles.metric}>
              <small>Pending accounting</small>
              <strong>{reconciliation.total}</strong>
            </div>
          </div>
          <div className={styles.notice}>
            Financial values are never aggregated across currencies. Exact per-currency
            totals remain in the wallet table and immutable ledger.
          </div>
        </div>
      </section>

      {canReadWallets ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>USER Wallets</p>
              <h2>Bucket balances</h2>
            </div>
          </div>
          {wallets.wallets.length === 0 ? (
            <div className={styles.empty}>No USER wallet accounts have been posted yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Currency</th>
                    <th>Main / Deposit</th>
                    <th>Package Earnings</th>
                    <th>Referral Commission</th>
                    <th>Rewards</th>
                    <th>Total Wallet</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.wallets.map((wallet) => (
                    <tr key={`${wallet.userId}-${wallet.currency}`}>
                      <td>
                        <strong>{wallet.username}</strong>
                        <span className={styles.meta}>{wallet.email ?? "—"}</span>
                      </td>
                      <td>{wallet.currency}</td>
                      <td>{compactDecimal(wallet.buckets.main)}</td>
                      <td>{compactDecimal(wallet.buckets.packageEarnings)}</td>
                      <td>{compactDecimal(wallet.buckets.referralCommission)}</td>
                      <td>{compactDecimal(wallet.buckets.rewards)}</td>
                      <td>
                        <strong>{compactDecimal(wallet.totalWallet)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {canReadLedger ? (
        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Immutable Ledger</p>
                <h2>Transactions</h2>
              </div>
            </div>
            {ledger.transactions.length === 0 ? (
              <div className={styles.empty}>No accounting transactions posted yet.</div>
            ) : (
              <div className={styles.list}>
                {ledger.transactions.map((transaction) => (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    key={transaction.id}
                    onClick={() => void inspectLedger(transaction)}
                    disabled={busy !== null}
                  >
                    {transaction.kind} · {transaction.currency} · {formatWalletDate(transaction.postedAt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Ledger Detail</p>
                <h2>{selectedLedger ? "Balanced entries" : "Select a transaction"}</h2>
              </div>
              {selectedLedger ? (
                <span
                  className={styles.badge}
                  data-tone={selectedLedger.balanced ? "success" : "warning"}
                >
                  {selectedLedger.balanced ? "Balanced" : "Unbalanced"}
                </span>
              ) : null}
            </div>

            {!selectedLedger ? (
              <div className={styles.empty}>
                Choose a ledger transaction to inspect its debit and credit entries.
              </div>
            ) : (
              <div className={styles.list}>
                {selectedLedger.entries.map((entry) => (
                  <div className={styles.row} key={entry.id}>
                    <div className={styles.rowTop}>
                      <strong>{entry.side}</strong>
                      <span className={styles.badge} data-tone="success">
                        {compactDecimal(entry.amount)} {entry.currency}
                      </span>
                    </div>
                    <span className={`${styles.meta} ${styles.mono}`}>
                      {entry.accountKey}
                    </span>
                    <p>{entry.memo ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
