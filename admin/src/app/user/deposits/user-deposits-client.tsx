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
  type DepositsResponse,
  compactDecimal,
  messageFrom,
  normalizeTransactionId,
  readJson,
  statusLabel,
  statusTone,
  transactionIdHint,
} from "@/lib/deposits";
import type { PackageCatalogue, PackagePlanItem } from "@/lib/packages";
import type { UserDirectSession } from "@/lib/user-session";

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

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function redirectFor(error: unknown): string | null {
  if (!(error instanceof UserWorkspaceAccessError)) return null;
  if (error.status === 401) return "/login";
  if (error.status === 403) {
    return error.redirectTo === "/dashboard" ? "/dashboard" : "/login";
  }
  return null;
}

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

async function fetchUserDepositWorkspace(): Promise<UserDepositWorkspace> {
  // Keep requests sequential so a rotating refresh token can never be raced by
  // parallel BFF calls.
  const sessionResponse = await fetch("/api/user/session", { cache: "no-store" });
  const session = await checkedUserJson<UserDirectSession & ApiMessagePayload>(
    sessionResponse,
    "USER session is unavailable.",
  );
  if (!session.user || !session.sessionPolicy) {
    throw new Error("USER session is incomplete.");
  }

  const packageResponse = await fetch("/api/user/packages", { cache: "no-store" });
  const packagePayload = await checkedUserJson<PackageCatalogue & ApiMessagePayload>(
    packageResponse,
    "Could not load available packages.",
  );

  const railResponse = await fetch("/api/user/deposit-payment-rails", {
    cache: "no-store",
  });
  const railPayload = await checkedUserJson<
    DepositPaymentRailsResponse & ApiMessagePayload
  >(railResponse, "Could not load available payment networks.");

  const depositResponse = await fetch("/api/user/deposits", { cache: "no-store" });
  const depositPayload = await checkedUserJson<DepositsResponse & ApiMessagePayload>(
    depositResponse,
    "Could not load deposit history.",
  );

  return {
    session,
    packages: packagePayload.catalogueAvailable
      ? packagePayload.items.filter((item) => item.availability === "AVAILABLE")
      : [],
    rails: railPayload.rails,
    deposits: depositPayload.deposits,
  };
}

export default function UserDepositsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [packages, setPackages] = useState<PackagePlanItem[]>([]);
  const [rails, setRails] = useState<DepositPaymentRail[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedRailId, setSelectedRailId] = useState("");
  const [txid, setTxid] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openDeposit = useMemo(
    () =>
      deposits.find(
        (deposit) =>
          deposit.status === "AWAITING_TXID" ||
          deposit.status === "PENDING_REVIEW",
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
        ? rails.filter((rail) => rail.asset === selectedPackage.currency && rail.isActive)
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
    setSelectedPackageId((current) =>
      workspace.packages.some((item) => item.id === current)
        ? current
        : (workspace.packages[0]?.id ?? ""),
    );
  }

  async function reloadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      applyWorkspace(await fetchUserDepositWorkspace());
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
    let mounted = true;

    async function loadInitialWorkspace() {
      try {
        const workspace = await fetchUserDepositWorkspace();
        if (mounted) applyWorkspace(workspace);
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
              : "Could not load deposit workspace.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitialWorkspace();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (eligibleRails.some((rail) => rail.id === selectedRailId)) return;
    const nextRailId = eligibleRails[0]?.id ?? "";
    queueMicrotask(() => setSelectedRailId(nextRailId));
  }, [eligibleRails, selectedRailId]);

  async function createDeposit() {
    if (!selectedPackageId || !selectedRailId || openDeposit) return;
    setBusy("create");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/user/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagePlanItemId: selectedPackageId,
          paymentRailId: selectedRailId,
        }),
      });
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not create deposit request."));
      }

      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create deposit request.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitTxid(deposit: Deposit) {
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
      const payload = await readJson<DepositMutationResponse & ApiMessagePayload>(
        response,
      );
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not submit transaction ID."));
      }

      setTxid("");
      setNotice(payload.message);
      await reloadWorkspace();
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

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Receiving address copied.");
    } catch {
      setError("Could not copy the receiving address.");
    }
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>CONFIGURED PAYMENT NETWORKS</p>
            <h1>Deposits</h1>
            <p>
              Select a package and one supported payment network for its currency.
              The backend then randomly assigns an active public receiving account
              inside that exact network. Never send funds on a different network.
            </p>
          </div>
          {openDeposit ? (
            <span className={styles.badge} data-tone={statusTone(openDeposit.status)}>
              {statusLabel(openDeposit.status)}
            </span>
          ) : null}
        </section>

        {notice ? <div className={styles.success}>{notice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {loading ? (
          <div className={styles.card}>
            <div className={styles.empty}>Loading deposit workspace…</div>
          </div>
        ) : openDeposit ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Open Deposit</p>
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
                    <small>Exact amount</small>
                    <strong>
                      {compactDecimal(openDeposit.amount)} {openDeposit.currency}
                    </strong>
                  </div>
                  <div>
                    <small>Network</small>
                    <strong>{openDeposit.assignedNetwork}</strong>
                  </div>
                  <div className={styles.full}>
                    <small>Assigned receiving address</small>
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
                  <label htmlFor="deposit-txid">
                    Transaction ID · {openDeposit.assignedNetwork}
                  </label>
                  <input
                    className={styles.input}
                    id="deposit-txid"
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
                    onClick={() => void submitTxid(openDeposit)}
                  >
                    {busy === `txid-${openDeposit.id}`
                      ? "Submitting…"
                      : "Submit transaction ID for review"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.notice}>
                Transaction ID <span className={styles.mono}>{openDeposit.txid}</span>{" "}
                was submitted {formatDate(openDeposit.submittedAt)}. Manual review
                is pending; do not send another payment for this request.
              </div>
            )}
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>New Deposit</p>
                <h2>Select package and payment network</h2>
              </div>
            </div>

            {packages.length === 0 ? (
              <div className={styles.empty}>No package is currently available.</div>
            ) : (
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="deposit-package">Package</label>
                  <select
                    className={styles.select}
                    id="deposit-package"
                    value={selectedPackageId}
                    onChange={(event) => setSelectedPackageId(event.target.value)}
                  >
                    {packages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} — {compactDecimal(item.price)} {item.currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
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

                {selectedPackage && selectedRail ? (
                  <div className={`${styles.notice} ${styles.full}`}>
                    Pay exactly{" "}
                    <strong>
                      {compactDecimal(selectedPackage.price)} {selectedPackage.currency}
                    </strong>{" "}
                    on <strong>{selectedRail.networkCode}</strong>. The receiving
                    address will be assigned by the backend from that rail&apos;s active
                    account pool.
                  </div>
                ) : null}

                <div className={`${styles.actions} ${styles.full}`}>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={!selectedPackageId || !selectedRailId || busy !== null}
                    onClick={() => void createDeposit()}
                  >
                    {busy === "create" ? "Creating…" : "Create deposit request"}
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
              onClick={() => void reloadWorkspace()}
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
                    <th>Amount</th>
                    <th>Network</th>
                    <th>Status</th>
                    <th>Transaction ID</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td>{deposit.packageDisplayName}</td>
                      <td>
                        {compactDecimal(deposit.amount)} {deposit.currency}
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
                      <td>{deposit.reviewNote ?? "—"}</td>
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
