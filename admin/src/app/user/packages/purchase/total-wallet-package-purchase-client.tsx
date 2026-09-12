"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/deposits/deposits.module.css";
import {
  apiMessage,
  decimalLabel,
  investmentRangeLabel,
  readApiPayload,
  type ApiErrorPayload,
  type PackageCatalogue,
  type PackagePlanItem,
} from "@/lib/packages";
import type { UserDirectSession } from "@/lib/user-session";
import type { UserWalletResponse } from "@/lib/wallet";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

interface Workspace {
  session: UserDirectSession;
  item: PackagePlanItem;
  totalWallet: string;
}

interface PurchaseResponse extends ApiErrorPayload {
  created?: boolean;
  subscriptionId?: string;
  amount?: string;
  currency?: string;
  fundingSource?: "TOTAL_WALLET";
  message?: string | string[];
}

async function loadWorkspace(packagePlanItemId: string): Promise<Workspace> {
  const [sessionResponse, catalogueResponse, walletResponse] = await Promise.all([
    fetch("/api/user/session", { cache: "no-store" }),
    fetch("/api/user/packages", { cache: "no-store" }),
    fetch("/api/user/wallet?limit=1", { cache: "no-store" }),
  ]);

  const session = await readApiPayload<UserDirectSession & ApiErrorPayload>(
    sessionResponse,
  );
  if (!sessionResponse.ok || !session?.user || !session.sessionPolicy) {
    throw new Error(apiMessage(session, "USER session is unavailable."));
  }

  const catalogue = await readApiPayload<PackageCatalogue & ApiErrorPayload>(
    catalogueResponse,
  );
  if (!catalogueResponse.ok || !catalogue) {
    throw new Error(apiMessage(catalogue, "Package catalogue is unavailable."));
  }

  const item = catalogue.items.find(
    (candidate) => candidate.id === packagePlanItemId,
  );
  if (!item || item.availability !== "AVAILABLE") {
    throw new Error("This package is not available for a new purchase.");
  }

  const wallet = await readApiPayload<UserWalletResponse & ApiErrorPayload>(
    walletResponse,
  );
  if (!walletResponse.ok || !wallet) {
    throw new Error(apiMessage(wallet, "Total Wallet is unavailable."));
  }

  const currencyWallet = wallet.wallets.find(
    (entry) => entry.currency === item.currency,
  );

  return {
    session,
    item,
    totalWallet: currencyWallet?.totalWallet ?? "0.00000000",
  };
}

export default function TotalWalletPackagePurchaseClient({
  packagePlanItemId,
}: {
  packagePlanItemId: string;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadWorkspace(packagePlanItemId)
      .then((loaded) => {
        if (!mounted) return;
        setWorkspace(loaded);
        setAmount(loaded.item.minimumInvestment || loaded.item.price);
      })
      .catch((caught) => {
        if (!mounted) return;
        setError(
          caught instanceof Error ? caught.message : "Package purchase is unavailable.",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [packagePlanItemId]);

  async function purchase() {
    if (!workspace || busy) return;
    const normalized = amount.trim();
    if (!MONEY_PATTERN.test(normalized) || Number(normalized) <= 0) {
      setError("Enter a valid package amount with up to 8 decimals.");
      return;
    }

    const value = Number(normalized);
    const minimum = Number(workspace.item.minimumInvestment);
    const maximum = workspace.item.maximumInvestment
      ? Number(workspace.item.maximumInvestment)
      : null;
    if (value < minimum) {
      setError(`Minimum package purchase is ${decimalLabel(workspace.item.minimumInvestment)} ${workspace.item.currency}.`);
      return;
    }
    if (maximum !== null && value > maximum) {
      setError(`Maximum package purchase is ${decimalLabel(workspace.item.maximumInvestment ?? "0")} ${workspace.item.currency}.`);
      return;
    }
    if (value > Number(workspace.totalWallet)) {
      setError("Total Wallet balance is insufficient for this package purchase.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/subscriptions/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          packagePlanItemId: workspace.item.id,
          amount: normalized,
        }),
      });
      const payload = await readApiPayload<PurchaseResponse>(response);
      if (!response.ok || !payload) {
        throw new Error(apiMessage(payload, "Package purchase failed."));
      }

      router.push("/user/packages");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Package purchase failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <UserShell session={workspace?.session ?? null}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>TOTAL WALLET PACKAGE PURCHASE</p>
            <h1>{workspace?.item.displayName ?? "Package purchase"}</h1>
            <p>
              Purchase directly from your authoritative Total Wallet. Main / Deposit,
              Package Earnings, Referral Commission and Rewards remain unchanged.
            </p>
          </div>
          <Link href="/user/packages" className={styles.buttonSecondary}>
            Back to Packages
          </Link>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading Total Wallet purchase…</div>
          </section>
        ) : !workspace ? (
          <section className={styles.card}>
            <div className={styles.empty}>Package purchase is unavailable.</div>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>{workspace.item.packageCode}</p>
                <h2>{workspace.item.displayName}</h2>
              </div>
              <span className={styles.badge} data-tone="success">
                TOTAL WALLET ONLY
              </span>
            </div>

            <div className={styles.kv}>
              <div>
                <small>Available Total Wallet</small>
                <strong>
                  {decimalLabel(workspace.totalWallet)} {workspace.item.currency}
                </strong>
              </div>
              <div>
                <small>Investment range</small>
                <strong>
                  {investmentRangeLabel(workspace.item)} {workspace.item.currency}
                </strong>
              </div>
              <div>
                <small>Duration</small>
                <strong>{workspace.item.durationDays} days</strong>
              </div>
              <div>
                <small>Funding source</small>
                <strong>Total Wallet</strong>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="package-purchase-amount">
                  Package amount · {workspace.item.currency}
                </label>
                <input
                  id="package-purchase-amount"
                  className={styles.input}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>

              <div className={`${styles.notice} ${styles.full}`}>
                A successful purchase reduces Total Wallet immediately. The four component
                wallet balances are not debited or rewritten.
              </div>

              <div className={`${styles.actions} ${styles.full}`}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy}
                  onClick={() => void purchase()}
                >
                  {busy ? "Purchasing…" : "Purchase from Total Wallet"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </UserShell>
  );
}
