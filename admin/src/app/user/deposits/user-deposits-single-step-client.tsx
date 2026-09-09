"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import styles from "@/components/deposits/deposits.module.css";
import {
  type ApiMessagePayload,
  type Deposit,
  type DepositMutationResponse,
  type DepositPaymentRail,
  type DepositPaymentRailsResponse,
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
import {
  investmentRangeLabel,
  type PackageCatalogue,
  type PackagePlanItem,
} from "@/lib/packages";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type { UserDirectSession } from "@/lib/user-session";

interface PermanentAddressAssignment {
  id: string;
  userId: string;
  paymentRailId: string;
  depositAccountId: string;
  asset: string;
  networkCode: string;
  displayName: string;
  validationProfile: DepositValidationProfile;
  walletAddress: string;
  qrCodeDataUrl: string;
  assignedAt: string;
  permanent: true;
}

interface PermanentAddressResponse extends ApiMessagePayload {
  assignment?: PermanentAddressAssignment;
}

interface UserDepositWorkspace {
  session: UserDirectSession;
  packages: PackagePlanItem[];
  rails: DepositPaymentRail[];
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

async function fetchWorkspace(): Promise<UserDepositWorkspace> {
  const sessionResponse = await fetch("/api/user/session", {
    cache: "no-store",
  });
  const session = await checkedUserJson<UserDirectSession & ApiMessagePayload>(
    sessionResponse,
    "USER session is unavailable.",
  );
  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  const packageResponse = await fetch("/api/user/packages", {
    cache: "no-store",
  });
  const packagePayload = await checkedUserJson<
    PackageCatalogue & ApiMessagePayload
  >(packageResponse, "Could not load available packages.");

  const railResponse = await fetch("/api/user/deposit-payment-rails", {
    cache: "no-store",
  });
  const railPayload = await checkedUserJson<
    DepositPaymentRailsResponse & ApiMessagePayload
  >(railResponse, "Could not load available payment networks.");

  const depositResponse = await fetch("/api/user/deposits", {
    cache: "no-store",
  });
  const depositPayload = await checkedUserJson<
    DepositsResponse & ApiMessagePayload
  >(depositResponse, "Could not load deposit history.");

  return {
    session,
    packages:
      packagePayload.catalogueAvailable && packagePayload.activationAvailable
        ? packagePayload.items.filter(
            (item) => item.availability === "AVAILABLE",
          )
        : [],
    rails: railPayload.rails,
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

export default function UserDepositsSingleStepClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [packages, setPackages] = useState<PackagePlanItem[]>([]);
  const [rails, setRails] = useState<DepositPaymentRail[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedRailId, setSelectedRailId] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [permanentAddress, setPermanentAddress] =
    useState<PermanentAddressAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [addressLoading, setAddressLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openDeposit = useMemo(
    () =>
      deposits.find(
        (deposit) =>
          deposit.status === "AWAITING_TXID" ||
          deposit.status === "PENDING_REVIEW" ||
          deposit.status === "READY_FOR_APPROVAL",
      ) ?? null,
    [deposits],
  );

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );

  const eligibleRails = useMemo(
    () =>
      selectedPackage
        ? rails.filter(
            (rail) => rail.asset === selectedPackage.currency && rail.isActive,
          )
        : [],
    [rails, selectedPackage],
  );

  const selectedRail = useMemo(
    () => eligibleRails.find((rail) => rail.id === selectedRailId) ?? null,
    [eligibleRails, selectedRailId],
  );

  function applyWorkspace(workspace: UserDepositWorkspace) {
    setSession(workspace.session);
    setPackages(workspace.packages);
    setRails(workspace.rails);
    setDeposits(workspace.deposits);

    const nextPackage =
      workspace.packages.find((item) => item.id === selectedPackageId) ??
      workspace.packages[0] ??
      null;
    setSelectedPackageId(nextPackage?.id ?? "");
    if (nextPackage && !investmentAmount) {
      setInvestmentAmount(nextPackage.minimumInvestment ?? nextPackage.price);
    }
  }

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      applyWorkspace(await fetchWorkspace());
    } catch (caught) {
      const redirectTo = redirectFor(caught);
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load deposit workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialWorkspace() {
      try {
        const workspace = await fetchWorkspace();
        if (!active) return;

        const firstPackage = workspace.packages[0] ?? null;
        setSession(workspace.session);
        setPackages(workspace.packages);
        setRails(workspace.rails);
        setDeposits(workspace.deposits);
        setSelectedPackageId(firstPackage?.id ?? "");
        setInvestmentAmount(
          firstPackage?.minimumInvestment ?? firstPackage?.price ?? "",
        );
      } catch (caught) {
        const redirectTo = redirectFor(caught);
        if (redirectTo) {
          router.replace(redirectTo);
          router.refresh();
          return;
        }
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load deposit workspace.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialWorkspace();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (eligibleRails.some((rail) => rail.id === selectedRailId)) return;
    const nextRailId = eligibleRails[0]?.id ?? "";
    queueMicrotask(() => setSelectedRailId(nextRailId));
  }, [eligibleRails, selectedRailId]);

  useEffect(() => {
    let active = true;

    if (!selectedRailId || openDeposit) {
      queueMicrotask(() => {
        if (!active) return;
        setPermanentAddress(null);
        setAddressLoading(false);
      });
      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (!active) return;
      setAddressLoading(true);
      setPermanentAddress(null);
    });

    async function ensureAddress() {
      try {
        const response = await fetch("/api/user/deposit-address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentRailId: selectedRailId }),
        });
        const payload = await readJson<PermanentAddressResponse>(response);
        if (!response.ok || !payload?.assignment) {
          throw new Error(
            messageFrom(payload, "Could not load permanent receiving address."),
          );
        }
        if (active) setPermanentAddress(payload.assignment);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load permanent receiving address.",
          );
        }
      } finally {
        if (active) setAddressLoading(false);
      }
    }

    void ensureAddress();
    return () => {
      active = false;
    };
  }, [selectedRailId, openDeposit]);

  function choosePackage(packageId: string) {
    const nextPackage = packages.find((item) => item.id === packageId) ?? null;
    setSelectedPackageId(packageId);
    setInvestmentAmount(
      nextPackage?.minimumInvestment ?? nextPackage?.price ?? "",
    );
    setTxid("");
    setError(null);
    setNotice(null);
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Receiving address copied.");
    } catch {
      setError("Could not copy the receiving address.");
    }
  }

  async function submitNewDeposit() {
    if (
      !selectedPackage ||
      !selectedRail ||
      !permanentAddress ||
      busy !== null
    ) {
      return;
    }

    const amount = investmentAmount.trim();
    if (!INVESTMENT_PATTERN.test(amount) || amount === "0") {
      setError("Enter a valid USDT investment amount with up to 8 decimals.");
      return;
    }

    const normalizedTxid = normalizeTransactionId(
      permanentAddress.validationProfile,
      txid,
    );
    if (!normalizedTxid) {
      setError(`Transaction ID is invalid for ${permanentAddress.networkCode}.`);
      return;
    }

    setBusy("submit");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/user/deposits/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagePlanItemId: selectedPackage.id,
          paymentRailId: selectedRail.id,
          investmentAmount: amount,
          txid: normalizedTxid,
        }),
      });
      const payload = await readJson<
        DepositMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not submit deposit."));
      }

      setTxid("");
      setNotice(payload.message);
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not submit deposit.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitLegacyTxid(deposit: Deposit) {
    const normalized = normalizeTransactionId(
      deposit.assignedValidationProfile,
      txid,
    );
    if (!normalized) {
      setError(`Transaction ID is invalid for ${deposit.assignedNetwork}.`);
      return;
    }

    setBusy(`txid-${deposit.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/user/deposits/${deposit.id}/txid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: normalized }),
      });
      const payload = await readJson<
        DepositMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not submit transaction ID."),
        );
      }
      setTxid("");
      setNotice(payload.message);
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit transaction ID.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>PERMANENT RECEIVING ADDRESS</p>
            <h1>Deposit</h1>
            <p>
              Your receiving address stays fixed for the selected payment
              network. Choose the package and exact investment, send payment to
              that address, then submit the transaction ID in one step.
            </p>
          </div>
          {openDeposit ? (
            <span
              className={styles.badge}
              data-tone={statusTone(openDeposit.status)}
            >
              {statusLabel(openDeposit.status)}
            </span>
          ) : null}
        </section>

        {notice ? <div className={styles.success}>{notice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {loading ? (
          <section className={styles.card}>
            <div className={styles.empty}>Loading deposit workspace…</div>
          </section>
        ) : openDeposit ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Deposit in progress</p>
                <h2>{openDeposit.packageDisplayName}</h2>
              </div>
              <span
                className={styles.badge}
                data-tone={statusTone(openDeposit.status)}
              >
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
                    <small>Permanent receiving address</small>
                    <strong className={styles.mono}>
                      {openDeposit.assignedWalletAddress}
                    </strong>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() =>
                      void copyAddress(openDeposit.assignedWalletAddress)
                    }
                  >
                    Copy address
                  </button>
                </div>
              </div>
            </div>

            {openDeposit.status === "AWAITING_TXID" ? (
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.full}`}>
                  <label htmlFor="legacy-deposit-txid">
                    Transaction ID · {openDeposit.assignedNetwork}
                  </label>
                  <input
                    className={styles.input}
                    id="legacy-deposit-txid"
                    value={txid}
                    onChange={(event) => setTxid(event.target.value)}
                    placeholder={transactionIdHint(
                      openDeposit.assignedValidationProfile,
                      openDeposit.assignedNetwork,
                    )}
                    maxLength={191}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div className={`${styles.actions} ${styles.full}`}>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void submitLegacyTxid(openDeposit)}
                  >
                    {busy === `txid-${openDeposit.id}`
                      ? "Submitting…"
                      : "Submit transaction ID for review"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.notice}>
                Transaction ID{" "}
                <span className={styles.mono}>{openDeposit.txid}</span> was
                submitted {formatPlatformDateTime(openDeposit.submittedAt)}. Do
                not send another payment for this request.
              </div>
            )}
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>ONE-STEP DEPOSIT</p>
                <h2>Send payment and submit transaction ID</h2>
              </div>
            </div>

            {packages.length === 0 ? (
              <div className={styles.empty}>
                No package is currently available.
              </div>
            ) : (
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="deposit-package">Package</label>
                  <select
                    className={styles.select}
                    id="deposit-package"
                    value={selectedPackageId}
                    onChange={(event) => choosePackage(event.target.value)}
                  >
                    {packages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} — {investmentRangeLabel(item)}{" "}
                        {item.currency}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="deposit-investment">Investment amount</label>
                  <input
                    className={styles.input}
                    id="deposit-investment"
                    inputMode="decimal"
                    value={investmentAmount}
                    onChange={(event) => setInvestmentAmount(event.target.value)}
                    placeholder={selectedPackage?.minimumInvestment ?? "0"}
                    maxLength={22}
                    autoComplete="off"
                  />
                </div>

                <div className={`${styles.field} ${styles.full}`}>
                  <label htmlFor="deposit-rail">Payment network</label>
                  <select
                    className={styles.select}
                    id="deposit-rail"
                    value={selectedRailId}
                    onChange={(event) => setSelectedRailId(event.target.value)}
                    disabled={eligibleRails.length === 0}
                  >
                    {eligibleRails.length === 0 ? (
                      <option value="">No active payment network</option>
                    ) : (
                      eligibleRails.map((rail) => (
                        <option key={rail.id} value={rail.id}>
                          {rail.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className={`${styles.full} ${styles.card}`}>
                  {addressLoading ? (
                    <div className={styles.empty}>
                      Loading permanent receiving address…
                    </div>
                  ) : permanentAddress ? (
                    <div className={styles.qrWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={styles.qr}
                        src={permanentAddress.qrCodeDataUrl}
                        alt={`${permanentAddress.asset} ${permanentAddress.networkCode} permanent receiving QR`}
                      />
                      <div className={styles.list}>
                        <div className={styles.kv}>
                          <div>
                            <small>Network</small>
                            <strong>{permanentAddress.networkCode}</strong>
                          </div>
                          <div>
                            <small>Address mode</small>
                            <strong>Permanent</strong>
                          </div>
                          <div className={styles.full}>
                            <small>Your permanent receiving address</small>
                            <strong className={styles.mono}>
                              {permanentAddress.walletAddress}
                            </strong>
                          </div>
                        </div>
                        <div className={styles.actions}>
                          <button
                            className={styles.buttonSecondary}
                            type="button"
                            onClick={() =>
                              void copyAddress(permanentAddress.walletAddress)
                            }
                          >
                            Copy address
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.empty}>
                      No permanent receiving address is available for this
                      network.
                    </div>
                  )}
                </div>

                <div className={`${styles.notice} ${styles.full}`}>
                  Send exactly{" "}
                  <strong>
                    {investmentAmount || "—"} {selectedPackage?.currency ?? ""}
                  </strong>{" "}
                  on{" "}
                  <strong>
                    {selectedRail?.networkCode ?? "the selected network"}
                  </strong>{" "}
                  to the permanent address above. The backend validates the
                  package range again before accepting the transaction ID.
                </div>

                <div className={`${styles.field} ${styles.full}`}>
                  <label htmlFor="deposit-txid">
                    Transaction ID ·{" "}
                    {permanentAddress?.networkCode ??
                      selectedRail?.networkCode ??
                      "network"}
                  </label>
                  <input
                    className={styles.input}
                    id="deposit-txid"
                    value={txid}
                    onChange={(event) => setTxid(event.target.value)}
                    placeholder={
                      permanentAddress
                        ? transactionIdHint(
                            permanentAddress.validationProfile,
                            permanentAddress.networkCode,
                          )
                        : "Transaction ID"
                    }
                    maxLength={191}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className={`${styles.actions} ${styles.full}`}>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={
                      !selectedPackage ||
                      !selectedRail ||
                      !permanentAddress ||
                      !investmentAmount.trim() ||
                      !txid.trim() ||
                      busy !== null
                    }
                    onClick={() => void submitNewDeposit()}
                  >
                    {busy === "submit"
                      ? "Submitting…"
                      : "Submit Deposit for Review"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>History</p>
              <h2>My deposits</h2>
            </div>
            <button
              className={styles.buttonSecondary}
              type="button"
              disabled={loading}
              onClick={() => void loadWorkspace()}
            >
              Refresh
            </button>
          </div>

          {deposits.length === 0 ? (
            <div className={styles.empty}>No deposit requests yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Investment</th>
                    <th>Duration</th>
                    <th>Network</th>
                    <th>Status</th>
                    <th>Transaction ID</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td>{deposit.packageDisplayName}</td>
                      <td>
                        {compactDecimal(deposit.amount)} {deposit.currency}
                      </td>
                      <td>
                        {deposit.packageDurationDays
                          ? `${deposit.packageDurationDays} days`
                          : "Legacy"}
                      </td>
                      <td>{deposit.assignedNetwork}</td>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={statusTone(deposit.status)}
                        >
                          {statusLabel(deposit.status)}
                        </span>
                      </td>
                      <td className={styles.mono}>{deposit.txid ?? "—"}</td>
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
