"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/payouts/payout.module.css";
import type { UserDirectSession } from "@/lib/user-session";
import {
  type PackageCatalogue,
  type PackagePlanItem,
  investmentRangeLabel,
} from "@/lib/packages";
import {
  type ApiMessagePayload,
  type CurrentPayoutPolicyResponse,
  type PayoutBucket,
  type PayoutRequest,
  type UserPayoutsResponse,
  compactPayoutDecimal,
  formatPayoutDate,
  messageFrom,
  payoutBucketLabel,
  payoutStatusTone,
  readJson,
} from "@/lib/payouts";
import {
  type UserWalletResponse,
  type WalletCurrencySummary,
  compactDecimal,
} from "@/lib/wallet";

interface UserApiPayload extends ApiMessagePayload {
  redirectTo?: string | null;
}

type WalletAction = "PAYOUT" | "REINVESTMENT";

class UserPayoutAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirectTo: string | null,
  ) {
    super(message);
    this.name = "UserPayoutAccessError";
  }
}

async function checkedJson<T extends UserApiPayload>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = await readJson<T>(response);

  if (response.status === 401 || response.status === 403) {
    throw new UserPayoutAccessError(
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
  if (!(error instanceof UserPayoutAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

function payoutBucketBalance(
  wallet: WalletCurrencySummary | null,
  bucket: PayoutBucket,
): string {
  if (!wallet) return "0";

  switch (bucket) {
    case "TOTAL_WALLET":
      return wallet.totalWallet;
    case "MAIN":
      return wallet.buckets.main;
    case "PACKAGE_EARNINGS":
      return wallet.buckets.packageEarnings;
    case "REFERRAL_COMMISSION":
      return wallet.buckets.referralCommission;
    case "REWARDS":
      return wallet.buckets.rewards;
  }
}

function decimalUnits(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(normalized)) {
    return null;
  }

  const [whole, fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * 100000000n +
    BigInt((fraction + "00000000").slice(0, 8))
  );
}

function amountFitsPackage(item: PackagePlanItem, amount: string): boolean {
  if (item.availability !== "AVAILABLE") return false;

  const amountUnits = decimalUnits(amount);
  const minimumUnits = decimalUnits(item.minimumInvestment);
  if (amountUnits === null || minimumUnits === null || amountUnits <= 0n) {
    return false;
  }

  if (!item.rangeConfigured) {
    const priceUnits = decimalUnits(item.price);
    return priceUnits !== null && amountUnits === priceUnits;
  }

  if (amountUnits < minimumUnits) return false;
  if (item.maximumInvestment === null) return true;

  const maximumUnits = decimalUnits(item.maximumInvestment);
  return maximumUnits !== null && amountUnits <= maximumUnits;
}

async function fetchPayoutWorkspace(): Promise<{
  session: UserDirectSession;
  policy: CurrentPayoutPolicyResponse;
  payouts: UserPayoutsResponse;
  wallet: UserWalletResponse;
  catalogue: PackageCatalogue | null;
}> {
  const sessionResponse = await fetch("/api/user/session", {
    cache: "no-store",
  });
  const session = await checkedJson<UserDirectSession & UserApiPayload>(
    sessionResponse,
    "USER session is unavailable.",
  );

  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  const [policyResponse, payoutsResponse, walletResponse, catalogueResponse] =
    await Promise.all([
      fetch("/api/user/payouts/policy", { cache: "no-store" }),
      fetch("/api/user/payouts?limit=50", { cache: "no-store" }),
      fetch("/api/user/wallet?page=1&limit=50", { cache: "no-store" }),
      fetch("/api/user/packages", { cache: "no-store" }),
    ]);

  const policy = await checkedJson<
    CurrentPayoutPolicyResponse & UserApiPayload
  >(policyResponse, "Could not load payout policy.");
  const payouts = await checkedJson<UserPayoutsResponse & UserApiPayload>(
    payoutsResponse,
    "Could not load payout history.",
  );
  const wallet = await checkedJson<UserWalletResponse & UserApiPayload>(
    walletResponse,
    "Could not load wallet balances.",
  );

  const cataloguePayload = await readJson<PackageCatalogue & UserApiPayload>(
    catalogueResponse,
  );
  const catalogue =
    catalogueResponse.ok && cataloguePayload ? cataloguePayload : null;

  return { session, policy, payouts, wallet, catalogue };
}

export default function UserPayoutsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [policy, setPolicy] = useState<CurrentPayoutPolicyResponse | null>(null);
  const [payouts, setPayouts] = useState<UserPayoutsResponse | null>(null);
  const [wallet, setWallet] = useState<UserWalletResponse | null>(null);
  const [catalogue, setCatalogue] = useState<PackageCatalogue | null>(null);
  const [walletAction, setWalletAction] = useState<WalletAction>("PAYOUT");
  const [sourceBucket, setSourceBucket] =
    useState<PayoutBucket>("TOTAL_WALLET");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [selectedPackagePlanItemId, setSelectedPackagePlanItemId] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const enabledBuckets = policy?.enabledBuckets ?? [];
  const requestsEnabled =
    Boolean(policy?.available) && Boolean(policy?.requestsEnabled);
  const activePolicy = policy?.policy ?? null;
  const sourceBucketEnabled = enabledBuckets.includes(sourceBucket);

  const payoutRows = useMemo<PayoutRequest[]>(
    () => payouts?.payouts ?? [],
    [payouts],
  );

  const activeWallet = useMemo<WalletCurrencySummary | null>(() => {
    const currency = activePolicy?.asset ?? "USDT";
    return (
      wallet?.wallets.find(
        (item) => item.currency.toUpperCase() === currency.toUpperCase(),
      ) ?? null
    );
  }, [activePolicy?.asset, wallet]);

  const selectedBucketBalance = payoutBucketBalance(activeWallet, sourceBucket);
  const walletCurrency = activeWallet?.currency ?? activePolicy?.asset ?? "USDT";

  const eligiblePackages = useMemo(() => {
    if (!catalogue?.catalogueAvailable || !catalogue.activationAvailable) {
      return [];
    }

    return catalogue.items.filter(
      (item) =>
        item.currency.toUpperCase() === walletCurrency.toUpperCase() &&
        amountFitsPackage(item, amount),
    );
  }, [amount, catalogue, walletCurrency]);

  const selectedPackage = useMemo(
    () =>
      eligiblePackages.find((item) => item.id === selectedPackagePlanItemId) ??
      eligiblePackages[0] ??
      null,
    [eligiblePackages, selectedPackagePlanItemId],
  );

  const canAffordReinvestment = useMemo(() => {
    const amountUnits = decimalUnits(amount);
    const availableUnits = decimalUnits(activeWallet?.totalWallet ?? "0");
    return (
      amountUnits !== null &&
      availableUnits !== null &&
      amountUnits > 0n &&
      amountUnits <= availableUnits
    );
  }, [activeWallet?.totalWallet, amount]);

  async function reload() {
    setLoading(true);
    setError(null);

    try {
      const workspace = await fetchPayoutWorkspace();
      setSession(workspace.session);
      setPolicy(workspace.policy);
      setPayouts(workspace.payouts);
      setWallet(workspace.wallet);
      setCatalogue(workspace.catalogue);

      if (
        workspace.policy.enabledBuckets.length > 0 &&
        !workspace.policy.enabledBuckets.includes(sourceBucket)
      ) {
        setSourceBucket(workspace.policy.enabledBuckets[0]);
      }
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load payout workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const workspace = await fetchPayoutWorkspace();
        if (!mounted) return;

        setSession(workspace.session);
        setPolicy(workspace.policy);
        setPayouts(workspace.payouts);
        setWallet(workspace.wallet);
        setCatalogue(workspace.catalogue);

        if (workspace.policy.enabledBuckets.length > 0) {
          setSourceBucket(workspace.policy.enabledBuckets[0]);
        }
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
            : "Could not load payout workspace.",
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

  async function submitPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (!requestsEnabled || !activePolicy) {
        throw new Error("Payout requests are currently disabled.");
      }
      if (!sourceBucketEnabled) {
        throw new Error("Total Wallet is not enabled for payouts.");
      }
      if (!amount.trim() || !destinationAddress.trim()) {
        throw new Error("Amount and destination address are required.");
      }

      const response = await fetch("/api/user/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          sourceBucket,
          amount: amount.trim(),
          destinationAddress: destinationAddress.trim(),
        }),
      });

      const payload = await checkedJson<
        ApiMessagePayload & { created: boolean; payout: PayoutRequest }
      >(response, "Payout request could not be created.");

      setAmount("");
      setDestinationAddress("");
      setSuccess(
        payload.created
          ? `Payout ${payload.payout.id} created and Total Wallet funds reserved.`
          : `Payout ${payload.payout.id} was already created.`,
      );

      await reload();
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Payout request could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReinvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (!amount.trim()) {
        throw new Error("Reinvestment amount is required.");
      }
      if (!catalogue?.catalogueAvailable || !catalogue.activationAvailable) {
        throw new Error("Package reinvestment is currently unavailable.");
      }
      if (!selectedPackage) {
        throw new Error("Choose a package that matches the reinvestment amount.");
      }
      if (!canAffordReinvestment) {
        throw new Error("Total Wallet balance is insufficient for this reinvestment.");
      }

      const response = await fetch("/api/user/payouts/reinvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          packagePlanItemId: selectedPackage.id,
          amount: amount.trim(),
        }),
      });

      const payload = await checkedJson<
        ApiMessagePayload & {
          created: boolean;
          subscriptionId: string;
          amount: string;
          currency: string;
        }
      >(response, "Reinvestment could not be completed.");

      setAmount("");
      setSelectedPackagePlanItemId("");
      setSuccess(
        payload.created
          ? `${selectedPackage.displayName} activated from ${compactDecimal(payload.amount)} ${payload.currency} Total Wallet reinvestment.`
          : `Reinvestment already exists as subscription ${payload.subscriptionId}.`,
      );

      await reload();
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Reinvestment could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submitWalletAction(event: FormEvent<HTMLFormElement>) {
    if (walletAction === "REINVESTMENT") {
      void submitReinvestment(event);
      return;
    }
    void submitPayout(event);
  }

  const payoutSubmitDisabled =
    busy ||
    !requestsEnabled ||
    !sourceBucketEnabled ||
    enabledBuckets.length === 0;
  const reinvestmentSubmitDisabled =
    busy || !selectedPackage || !canAffordReinvestment;

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

        {success ? (
          <FlashMessage
            message={success}
            type="success"
            onClose={() => setSuccess(null)}
          />
        ) : null}

        <section className={styles.hero}>
          <p className={styles.eyebrow}>PAYOUT-01 / TOTAL WALLET ACTIONS</p>
          <h1>Payouts</h1>
          <p>
            Choose whether to withdraw from Total Wallet or reinvest the entered
            amount into an eligible published package. The existing Packages →
            Deposit / TXID flow remains unchanged.
          </p>
        </section>

        <section className={styles.warning}>
          External payout requires only a public destination address. Reinvestment
          never asks for a blockchain address and does not create a payout fee or
          external transfer.
        </section>

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading payout workspace…</div>
          </section>
        ) : activePolicy ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Effective Payout Policy</p>
                <h2>
                  {activePolicy.asset} / {activePolicy.networkCode}
                </h2>
              </div>
              <span
                className={styles.badge}
                data-tone={requestsEnabled ? "success" : "warning"}
              >
                {requestsEnabled ? "Requests enabled" : "Requests disabled"}
              </span>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <small>Minimum</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.minimumAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Maximum</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.maximumAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Fixed fee</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.fixedFeeAmount)} {activePolicy.asset}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Percentage fee</small>
                <strong>
                  {compactPayoutDecimal(activePolicy.percentageFee)}%
                </strong>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.empty}>
              No published payout policy is effective. External payout requests are fail-closed.
            </div>
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Available Wallet</p>
              <h2>{activePolicy?.asset ?? "USDT"} balances</h2>
            </div>
            {activeWallet ? (
              <span className={styles.badge} data-tone="success">
                Total {compactDecimal(activeWallet.totalWallet)} {activeWallet.currency}
              </span>
            ) : null}
          </div>

          {activeWallet ? (
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <small>Main / Deposit</small>
                <strong>
                  {compactDecimal(activeWallet.buckets.main)} {activeWallet.currency}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Package Earnings</small>
                <strong>
                  {compactDecimal(activeWallet.buckets.packageEarnings)} {activeWallet.currency}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Referral Commission</small>
                <strong>
                  {compactDecimal(activeWallet.buckets.referralCommission)} {activeWallet.currency}
                </strong>
              </div>
              <div className={styles.metric}>
                <small>Rewards</small>
                <strong>
                  {compactDecimal(activeWallet.buckets.rewards)} {activeWallet.currency}
                </strong>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>
              No wallet balance is available for the payout asset.
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>New Total Wallet Action</p>
              <h2>
                {walletAction === "PAYOUT"
                  ? "Request payout"
                  : "Reinvest into package"}
              </h2>
            </div>
          </div>

          <form onSubmit={submitWalletAction} className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="wallet-action">Action</label>
              <select
                id="wallet-action"
                className={styles.select}
                value={walletAction}
                onChange={(event) =>
                  setWalletAction(event.target.value as WalletAction)
                }
                disabled={busy}
              >
                <option value="PAYOUT">Payout</option>
                <option value="REINVESTMENT">Reinvestment</option>
              </select>
              <span className={styles.help}>
                Payout sends funds externally. Reinvestment activates an eligible
                package from Total Wallet.
              </span>
            </div>

            {walletAction === "PAYOUT" ? (
              <div className={styles.field}>
                <label htmlFor="payout-source-bucket">Payout source</label>
                <select
                  id="payout-source-bucket"
                  className={styles.select}
                  value={sourceBucket}
                  onChange={(event) =>
                    setSourceBucket(event.target.value as PayoutBucket)
                  }
                  disabled={busy || !requestsEnabled}
                >
                  {enabledBuckets.length === 0 ? (
                    <option value="TOTAL_WALLET">Total Wallet not enabled</option>
                  ) : (
                    enabledBuckets.map((bucket) => (
                      <option value={bucket} key={bucket}>
                        {payoutBucketLabel(bucket)}
                      </option>
                    ))
                  )}
                </select>
                <span className={styles.help}>
                  Available for payout: {compactDecimal(selectedBucketBalance)}{" "}
                  {walletCurrency}
                </span>
              </div>
            ) : (
              <div className={styles.field}>
                <label>Reinvestment source</label>
                <input
                  className={styles.input}
                  value="Total Wallet"
                  readOnly
                  disabled
                />
                <span className={styles.help}>
                  Available for reinvestment:{" "}
                  {compactDecimal(activeWallet?.totalWallet ?? "0")} {walletCurrency}
                </span>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="payout-amount">
                {walletAction === "PAYOUT"
                  ? "Gross amount"
                  : "Reinvestment amount"}
              </label>
              <input
                id="payout-amount"
                className={styles.input}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="100"
                disabled={
                  busy || (walletAction === "PAYOUT" && !requestsEnabled)
                }
              />
              {walletAction === "REINVESTMENT" ? (
                <span className={styles.help}>
                  Package choices below are filtered automatically by this exact
                  amount.
                </span>
              ) : null}
            </div>

            {walletAction === "REINVESTMENT" ? (
              <div className={styles.field}>
                <label htmlFor="reinvestment-package">Eligible package</label>
                <select
                  id="reinvestment-package"
                  className={styles.select}
                  value={selectedPackage?.id ?? ""}
                  onChange={(event) =>
                    setSelectedPackagePlanItemId(event.target.value)
                  }
                  disabled={busy || eligiblePackages.length === 0}
                >
                  {eligiblePackages.length === 0 ? (
                    <option value="">
                      {amount.trim()
                        ? "No package matches this amount"
                        : "Enter an amount first"}
                    </option>
                  ) : (
                    eligiblePackages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} · {investmentRangeLabel(item)}{" "}
                        {item.currency} · {item.durationDays} days
                      </option>
                    ))
                  )}
                </select>
                <span className={styles.help}>
                  Only AVAILABLE packages whose published investment range
                  contains the entered amount are shown.
                </span>
              </div>
            ) : null}

            {walletAction === "PAYOUT" ? (
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="payout-address">Public destination address</label>
                <input
                  id="payout-address"
                  className={`${styles.input} ${styles.mono}`}
                  value={destinationAddress}
                  onChange={(event) => setDestinationAddress(event.target.value)}
                  placeholder={
                    activePolicy?.validationProfile === "TRON"
                      ? "TRON / TRC20 public address"
                      : "Public network address"
                  }
                  disabled={busy || !requestsEnabled}
                  autoComplete="off"
                />
                <span className={styles.help}>
                  Address validation follows the published network profile.
                </span>
              </div>
            ) : (
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.help}>
                  Reinvestment uses the full entered amount as package principal.
                  No payout fee, public address, or blockchain transfer is created.
                </span>
              </div>
            )}

            <div className={styles.actions} style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                className={styles.button}
                disabled={
                  walletAction === "PAYOUT"
                    ? payoutSubmitDisabled
                    : reinvestmentSubmitDisabled
                }
              >
                {busy
                  ? "Submitting…"
                  : walletAction === "PAYOUT"
                    ? "Reserve funds & request payout"
                    : "Reinvest & activate package"}
              </button>
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Immutable Workflow</p>
              <h2>My payout history</h2>
            </div>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void reload()}
              disabled={loading || busy}
            >
              Refresh
            </button>
          </div>

          {payoutRows.length === 0 ? (
            <div className={styles.empty}>No payout requests yet.</div>
          ) : (
            <div className={styles.list}>
              {payoutRows.map((payout) => {
                const tone = payoutStatusTone(payout.status);
                return (
                  <article className={styles.row} key={payout.id}>
                    <div className={styles.rowTop}>
                      <div>
                        <strong>
                          {compactPayoutDecimal(payout.grossAmount)} {payout.asset}
                        </strong>
                        <span className={styles.meta}>
                          {payoutBucketLabel(payout.sourceBucket)} ·{" "}
                          {payout.networkCode} · {formatPayoutDate(payout.createdAt)}
                        </span>
                      </div>
                      <span
                        className={styles.badge}
                        data-tone={tone === "neutral" ? undefined : tone}
                      >
                        {payout.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className={styles.metrics}>
                      <div className={styles.metric}>
                        <small>Fee</small>
                        <strong>
                          {compactPayoutDecimal(payout.feeAmount)} {payout.asset}
                        </strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Net payout</small>
                        <strong>
                          {compactPayoutDecimal(payout.netAmount)} {payout.asset}
                        </strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Reviewed</small>
                        <strong>{formatPayoutDate(payout.reviewedAt)}</strong>
                      </div>
                      <div className={styles.metric}>
                        <small>Completed</small>
                        <strong>{formatPayoutDate(payout.completedAt)}</strong>
                      </div>
                    </div>

                    <p>
                      Destination:{" "}
                      <span className={styles.mono}>
                        {payout.destinationAddress}
                      </span>
                    </p>
                    {payout.externalTxid ? (
                      <p>
                        External TXID:{" "}
                        <span className={styles.mono}>{payout.externalTxid}</span>
                      </p>
                    ) : null}
                    {payout.reviewNote ? (
                      <p>Review note: {payout.reviewNote}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
