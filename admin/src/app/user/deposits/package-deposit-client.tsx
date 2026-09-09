"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/deposits/deposits.module.css";
import {
  type ApiMessagePayload,
  type Deposit,
  type DepositMutationResponse,
  type DepositValidationProfile,
  type DepositsResponse,
  compactDecimal,
  messageFrom,
  normalizeTransactionId,
  readJson,
  statusLabel,
  statusTone,
  transactionIdHint,
} from "@/lib/deposits";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";

interface PackageDepositContext {
  package: {
    id: string;
    packageDefinitionId: string;
    packageCode: string;
    displayName: string;
    currency: string;
    price: string;
    minimumInvestment: string | null;
    maximumInvestment: string | null;
    durationDays: number | null;
  };
  receivingAccount: {
    id: string;
    label: string;
    paymentRailId: string;
    paymentRailDisplayName: string;
    asset: string;
    network: string;
    walletAddress: string;
    qrCodeDataUrl: string;
    validationProfile: DepositValidationProfile;
  };
  openDeposit: {
    id: string;
    status: string;
    packagePlanItemId: string;
    packageDisplayName: string;
  } | null;
}

interface Workspace {
  session: UserDirectSession;
  context: PackageDepositContext;
  deposits: Deposit[];
}

class UserWorkspaceAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserWorkspaceAccessError";
  }
}

const INVESTMENT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

async function checkedUserJson<T extends ApiMessagePayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);
  if (response.status === 401 || response.status === 403) {
    throw new UserWorkspaceAccessError(
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

async function fetchWorkspace(packagePlanItemId: string): Promise<Workspace> {
  const sessionResponse = await fetch("/api/user/session", { cache: "no-store" });
  const session = await checkedUserJson<UserDirectSession & ApiMessagePayload>(
    sessionResponse,
    "USER session is unavailable.",
  );

  const [contextResponse, depositsResponse] = await Promise.all([
    fetch(
      `/api/user/deposits/context/${encodeURIComponent(packagePlanItemId)}`,
      { cache: "no-store" },
    ),
    fetch("/api/user/deposits", { cache: "no-store" }),
  ]);

  const context = await checkedUserJson<PackageDepositContext & ApiMessagePayload>(
    contextResponse,
    "This package is not currently available for deposits.",
  );
  const depositPayload = await checkedUserJson<DepositsResponse & ApiMessagePayload>(
    depositsResponse,
    "Could not load deposit history.",
  );

  return {
    session,
    context,
    deposits: depositPayload.deposits,
  };
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserWorkspaceAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

function investmentRange(context: PackageDepositContext): string {
  const minimum = context.package.minimumInvestment;
  const maximum = context.package.maximumInvestment;
  if (!minimum) return compactDecimal(context.package.price);
  return maximum
    ? `${compactDecimal(minimum)}–${compactDecimal(maximum)}`
    : `${compactDecimal(minimum)}+`;
}

export default function PackageDepositClient({
  packagePlanItemId,
}: {
  packagePlanItemId: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [context, setContext] = useState<PackageDepositContext | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function applyReload() {
    const workspace = await fetchWorkspace(packagePlanItemId);
    setSession(workspace.session);
    setContext(workspace.context);
    setDeposits(workspace.deposits);
    const suggestedAmount =
      workspace.context.package.minimumInvestment ?? workspace.context.package.price;
    setInvestmentAmount((current) => current || suggestedAmount);
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const workspace = await fetchWorkspace(packagePlanItemId);
        if (!mounted) return;
        setSession(workspace.session);
        setContext(workspace.context);
        setDeposits(workspace.deposits);
        setInvestmentAmount(
          workspace.context.package.minimumInvestment ?? workspace.context.package.price,
        );
      } catch (caught) {
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          router.refresh();
          return;
        }
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load package deposit workspace.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [packagePlanItemId, router]);

  const openDeposit =
    deposits.find(
      (deposit) =>
        deposit.status === "AWAITING_TXID" ||
        deposit.status === "PENDING_REVIEW" ||
        deposit.status === "READY_FOR_APPROVAL",
    ) ?? null;

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Receiving address copied.");
    } catch {
      setError("Could not copy the receiving address.");
    }
  }

  async function submitPackageDeposit() {
    if (!context || busy || openDeposit) return;

    const amount = investmentAmount.trim();
    if (!INVESTMENT_PATTERN.test(amount) || amount === "0") {
      setError("Enter a valid investment amount with up to 8 decimals.");
      return;
    }

    const normalizedTxid = normalizeTransactionId(
      context.receivingAccount.validationProfile,
      txid,
    );
    if (!normalizedTxid) {
      setError(
        `Transaction ID is invalid for ${context.receivingAccount.network}.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/user/deposits/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagePlanItemId: context.package.id,
          investmentAmount: amount,
          txid: normalizedTxid,
        }),
      });
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not submit deposit."));
      }

      setTxid("");
      setNotice(payload.message);
      await applyReload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not submit deposit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitLegacyTxid(deposit: Deposit) {
    const normalizedTxid = normalizeTransactionId(
      deposit.assignedValidationProfile,
      txid,
    );
    if (!normalizedTxid) {
      setError(`Transaction ID is invalid for ${deposit.assignedNetwork}.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/user/deposits/${deposit.id}/txid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: normalizedTxid }),
      });
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not submit transaction ID."),
        );
      }

      setTxid("");
      setNotice(payload.message);
      await applyReload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit transaction ID.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>PACKAGE-SPECIFIC DEPOSIT</p>
            <h1>{context?.package.displayName ?? "Deposit"}</h1>
            <p>
              This page is locked to the package you selected. Its configured
              receiving account, network, QR and public address are fixed for all
              new deposits to this package.
            </p>
          </div>
          <Link href="/user/packages" className={styles.buttonSecondary}>
            Back to Packages
          </Link>
        </section>

        {notice ? <div className={styles.success}>{notice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading package deposit route…</div>
          </section>
        ) : !context ? (
          <section className={styles.card}>
            <div className={styles.empty}>
              This package cannot accept deposits right now. Return to Packages
              and choose another available package.
            </div>
          </section>
        ) : openDeposit ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Deposit already in progress</p>
                <h2>{openDeposit.packageDisplayName}</h2>
              </div>
              <span className={styles.badge} data-tone={statusTone(openDeposit.status)}>
                {statusLabel(openDeposit.status)}
              </span>
            </div>

            <div className={styles.qrWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.qr}
                src={openDeposit.assignedQrCodeDataUrl}
                alt={`${openDeposit.currency} ${openDeposit.assignedNetwork} receiving QR`}
              />
              <div className={styles.list}>
                <div className={styles.kv}>
                  <div>
                    <small>Exact investment</small>
                    <strong>
                      {compactDecimal(openDeposit.amount)} {openDeposit.currency}
                    </strong>
                  </div>
                  <div>
                    <small>Network</small>
                    <strong>{openDeposit.assignedNetwork}</strong>
                  </div>
                  <div className={styles.full}>
                    <small>Receiving address</small>
                    <strong className={styles.mono}>
                      {openDeposit.assignedWalletAddress}
                    </strong>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => void copyAddress(openDeposit.assignedWalletAddress)}
                  >
                    Copy address
                  </button>
                </div>
              </div>
            </div>

            {openDeposit.status === "AWAITING_TXID" ? (
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.full}`}>
                  <label htmlFor="legacy-txid">
                    Transaction ID · {openDeposit.assignedNetwork}
                  </label>
                  <input
                    className={styles.input}
                    id="legacy-txid"
                    value={txid}
                    onChange={(event) => setTxid(event.target.value)}
                    placeholder={transactionIdHint(
                      openDeposit.assignedValidationProfile,
                      openDeposit.assignedNetwork,
                    )}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div className={`${styles.actions} ${styles.full}`}>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={busy}
                    onClick={() => void submitLegacyTxid(openDeposit)}
                  >
                    {busy ? "Submitting…" : "Submit Transaction ID"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.notice}>
                This deposit has already been submitted. Wait for the current
                review/approval step before starting another deposit.
              </div>
            )}
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>{context.package.packageCode}</p>
                <h2>{context.package.displayName}</h2>
              </div>
              <span className={styles.badge} data-tone="success">
                FIXED PACKAGE ROUTE
              </span>
            </div>

            <div className={styles.qrWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.qr}
                src={context.receivingAccount.qrCodeDataUrl}
                alt={`${context.receivingAccount.asset} ${context.receivingAccount.network} receiving QR`}
              />
              <div className={styles.list}>
                <div className={styles.kv}>
                  <div>
                    <small>Investment range</small>
                    <strong>
                      {investmentRange(context)} {context.package.currency}
                    </strong>
                  </div>
                  <div>
                    <small>Duration</small>
                    <strong>
                      {context.package.durationDays ?? "—"} days
                    </strong>
                  </div>
                  <div>
                    <small>Network</small>
                    <strong>{context.receivingAccount.network}</strong>
                  </div>
                  <div>
                    <small>Receiving account</small>
                    <strong>{context.receivingAccount.label}</strong>
                  </div>
                  <div className={styles.full}>
                    <small>Receiving address</small>
                    <strong className={styles.mono}>
                      {context.receivingAccount.walletAddress}
                    </strong>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() =>
                      void copyAddress(context.receivingAccount.walletAddress)
                    }
                  >
                    Copy address
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="investment-amount">
                  Investment amount · {context.package.currency}
                </label>
                <input
                  className={styles.input}
                  id="investment-amount"
                  value={investmentAmount}
                  onChange={(event) => setInvestmentAmount(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="package-txid">
                  Transaction ID · {context.receivingAccount.network}
                </label>
                <input
                  className={styles.input}
                  id="package-txid"
                  value={txid}
                  onChange={(event) => setTxid(event.target.value)}
                  placeholder={transactionIdHint(
                    context.receivingAccount.validationProfile,
                    context.receivingAccount.network,
                  )}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className={`${styles.notice} ${styles.full}`}>
                Send only {context.receivingAccount.asset} on {context.receivingAccount.network} to the address above. The package, account and network are selected by configuration and cannot be changed on this page.
              </div>
              <div className={`${styles.actions} ${styles.full}`}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitPackageDeposit()}
                >
                  {busy ? "Submitting…" : "Submit Deposit"}
                </button>
              </div>
            </div>
          </section>
        )}

        {deposits.length > 0 ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Deposit History</p>
                <h2>Recent submissions</h2>
              </div>
            </div>
            <div className={styles.list}>
              {deposits.slice(0, 10).map((deposit) => (
                <div className={styles.row} key={deposit.id}>
                  <div className={styles.rowTop}>
                    <div className={styles.rowTitle}>
                      <strong>
                        {deposit.packageDisplayName} · {compactDecimal(deposit.amount)} {deposit.currency}
                      </strong>
                      <small>{formatPlatformDateTime(deposit.createdAt)}</small>
                    </div>
                    <span className={styles.badge} data-tone={statusTone(deposit.status)}>
                      {statusLabel(deposit.status)}
                    </span>
                  </div>
                  <div className={styles.kv}>
                    <div>
                      <small>Network</small>
                      <strong>{deposit.assignedNetwork}</strong>
                    </div>
                    <div>
                      <small>Transaction ID</small>
                      <strong className={styles.mono}>
                        {deposit.txid ?? "Not submitted"}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </UserShell>
  );
}
