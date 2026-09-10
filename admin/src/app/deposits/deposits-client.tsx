"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "@/components/deposits/deposits.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  DEPOSIT_VALIDATION_PROFILES,
  type ApiMessagePayload,
  type Deposit,
  type DepositAccount,
  type DepositAccountMutationResponse,
  type DepositAccountsResponse,
  type DepositAccountingResponse,
  type DepositBulkApprovalResponse,
  type DepositMutationResponse,
  type DepositPaymentRail,
  type DepositPaymentRailMutationResponse,
  type DepositPaymentRailsResponse,
  type DepositsResponse,
  type DepositStatus,
  compactDecimal,
  messageFrom,
  readJson,
  statusLabel,
  statusTone,
  sumDecimalStrings,
} from "@/lib/deposits";
import { formatPlatformDateTime } from "@/lib/platform-time";

const MAX_QR_BYTES = 256 * 1024;
const QR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

type DepositFilter = DepositStatus | "ALL";

interface PackageAccountRoute {
  packageDefinitionId: string;
  packagePlanItemId: string;
  packageCode: string;
  displayName: string;
  currency: string;
  sortOrder: number;
  availability: string;
  depositAccountId: string | null;
  routeUpdatedAt: string | null;
}

interface PackageAccountRoutesResponse extends ApiMessagePayload {
  planVersionId: string | null;
  planVersionNumber: number | null;
  packages: PackageAccountRoute[];
}

interface AdminDepositWorkspace {
  user: AdminUser;
  rails: DepositPaymentRail[];
  accounts: DepositAccount[];
  packageRoutes: PackageAccountRoutesResponse | null;
  deposits: Deposit[];
}

function formatDate(value: string | null): string {
  return formatPlatformDateTime(value);
}

async function fileToDataUrl(file: File): Promise<string> {
  if (!QR_TYPES.has(file.type)) {
    throw new Error("QR image must be PNG, JPG, WEBP, or SVG.");
  }
  if (file.size > MAX_QR_BYTES) {
    throw new Error("QR image must be 256 KiB or smaller.");
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read QR image."));
    reader.onerror = () => reject(new Error("Could not read QR image."));
    reader.readAsDataURL(file);
  });
}

function isSuperAdmin(user: AdminUser): boolean {
  return user.roles.includes("SUPER_ADMIN");
}

function hasPermission(user: AdminUser, permission: string): boolean {
  return isSuperAdmin(user) || user.permissions.includes(permission);
}

function isBulkApprovableStatus(status: DepositStatus): boolean {
  return status === "PENDING_REVIEW" || status === "READY_FOR_APPROVAL";
}

async function fetchAdminDepositWorkspace(
  filter: DepositFilter,
): Promise<AdminDepositWorkspace> {
  const session = await resolveAdminSession();
  if (!session.user) {
    throw new Error(session.message ?? "Administrator session is unavailable.");
  }

  const user = session.user;
  const canReadAccounts = hasPermission(user, "deposits.accounts.read");
  const canReadDeposits = hasPermission(user, "deposits.read");
  const query = filter === "ALL" ? "" : `?status=${filter}`;

  const railRequest = canReadAccounts
    ? fetch("/api/admin/deposit-payment-rails", { cache: "no-store" })
    : Promise.resolve(null);
  const accountRequest = canReadAccounts
    ? fetch("/api/admin/deposit-accounts", { cache: "no-store" })
    : Promise.resolve(null);
  const packageRouteRequest = canReadAccounts
    ? fetch("/api/admin/deposit-package-accounts", { cache: "no-store" })
    : Promise.resolve(null);
  const depositRequest = canReadDeposits
    ? fetch(`/api/admin/deposits${query}`, { cache: "no-store" })
    : Promise.resolve(null);

  const [railResponse, accountResponse, packageRouteResponse, depositResponse] =
    await Promise.all([
      railRequest,
      accountRequest,
      packageRouteRequest,
      depositRequest,
    ]);

  let rails: DepositPaymentRail[] = [];
  let accounts: DepositAccount[] = [];
  let packageRoutes: PackageAccountRoutesResponse | null = null;
  let deposits: Deposit[] = [];

  if (railResponse) {
    const payload = await readJson<
      DepositPaymentRailsResponse & ApiMessagePayload
    >(railResponse);
    if (!railResponse.ok || !payload) {
      throw new Error(messageFrom(payload, "Could not load payment rails."));
    }
    rails = payload.rails;
  }

  if (accountResponse) {
    const payload = await readJson<DepositAccountsResponse & ApiMessagePayload>(
      accountResponse,
    );
    if (!accountResponse.ok || !payload) {
      throw new Error(messageFrom(payload, "Could not load deposit accounts."));
    }
    accounts = payload.accounts;
  }

  if (packageRouteResponse) {
    const payload = await readJson<PackageAccountRoutesResponse>(
      packageRouteResponse,
    );
    if (!packageRouteResponse.ok || !payload) {
      throw new Error(
        messageFrom(payload, "Could not load package receiving-account routes."),
      );
    }
    packageRoutes = payload;
  }

  if (depositResponse) {
    const payload = await readJson<DepositsResponse & ApiMessagePayload>(
      depositResponse,
    );
    if (!depositResponse.ok || !payload) {
      throw new Error(messageFrom(payload, "Could not load deposits."));
    }
    deposits = payload.deposits;
  }

  return { user, rails, accounts, packageRoutes, deposits };
}

export default function DepositsClient() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rails, setRails] = useState<DepositPaymentRail[]>([]);
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [packageRoutes, setPackageRoutes] =
    useState<PackageAccountRoutesResponse | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filter, setFilter] = useState<DepositFilter>("PENDING_REVIEW");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  const [bulkApprovalNote, setBulkApprovalNote] = useState("");
  const [packageAccountsOpen, setPackageAccountsOpen] = useState(false);

  const canReadAccounts =
    user !== null && hasPermission(user, "deposits.accounts.read");
  const canManageAccounts =
    user !== null && hasPermission(user, "deposits.accounts.manage");
  const canReadDeposits = user !== null && hasPermission(user, "deposits.read");
  const canReview = user !== null && hasPermission(user, "deposits.review");
  const canMarkReady =
    user !== null &&
    !isSuperAdmin(user) &&
    user.roles.includes("ADMIN") &&
    hasPermission(user, "deposits.review");
  const canApprove = user !== null && isSuperAdmin(user);
  const canPostAccounting = user !== null && hasPermission(user, "ledger.post");

  const activeRails = useMemo(
    () => rails.filter((rail) => rail.isActive),
    [rails],
  );
  const unconfiguredPackages = useMemo(
    () =>
      (packageRoutes?.packages ?? []).filter(
        (route) => route.depositAccountId === null,
      ),
    [packageRoutes],
  );
  const pendingCount = useMemo(
    () =>
      deposits.filter((deposit) => deposit.status === "PENDING_REVIEW").length,
    [deposits],
  );
  const readyCount = useMemo(
    () =>
      deposits.filter((deposit) => deposit.status === "READY_FOR_APPROVAL").length,
    [deposits],
  );

  function applyWorkspace(workspace: AdminDepositWorkspace) {
    setUser(workspace.user);
    setRails(workspace.rails);
    setAccounts(workspace.accounts);
    setPackageRoutes(workspace.packageRoutes);
    setDeposits(workspace.deposits);
    setSelectedApprovalIds((current) =>
      current.filter((id) =>
        workspace.deposits.some(
          (deposit) =>
            deposit.id === id && isBulkApprovableStatus(deposit.status),
        ),
      ),
    );
  }

  async function reloadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      applyWorkspace(await fetchAdminDepositWorkspace(filter));
    } catch (caught) {
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
        const workspace = await fetchAdminDepositWorkspace(filter);
        if (mounted) applyWorkspace(workspace);
      } catch (caught) {
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
  }, [filter]);

  async function createRail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy("create-rail");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/deposit-payment-rails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: String(formData.get("asset") ?? ""),
          networkCode: String(formData.get("networkCode") ?? ""),
          displayName: String(formData.get("displayName") ?? ""),
          validationProfile: String(formData.get("validationProfile") ?? ""),
          isActive: formData.get("isActive") === "on",
          reason: String(formData.get("reason") ?? ""),
        }),
      });
      const payload = await readJson<
        DepositPaymentRailMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not create payment rail."));
      }

      form.reset();
      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create payment rail.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateRail(
    event: FormEvent<HTMLFormElement>,
    rail: DepositPaymentRail,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(`rail-${rail.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/deposit-payment-rails/${rail.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: rail.revision,
            displayName: String(formData.get("displayName") ?? ""),
            isActive: formData.get("isActive") === "on",
            reason: String(formData.get("reason") ?? ""),
          }),
        },
      );
      const payload = await readJson<
        DepositPaymentRailMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not update payment rail."));
      }

      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update payment rail.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const qrFile = formData.get("qr") as File | null;

    if (!qrFile || qrFile.size === 0) {
      setError("QR image is required.");
      return;
    }

    const packageDefinitionId = String(
      formData.get("packageDefinitionId") ?? "",
    ).trim();
    const paymentRailId = String(formData.get("paymentRailId") ?? "").trim();

    if (!packageDefinitionId) {
      setError("Choose a package for this receiving account.");
      return;
    }
    if (!paymentRailId) {
      setError("No active payment rail is available for this account.");
      return;
    }

    setBusy("create-account");
    setError(null);
    setNotice(null);

    try {
      const qrCodeDataUrl = await fileToDataUrl(qrFile);
      const response = await fetch("/api/admin/deposit-package-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageDefinitionId,
          paymentRailId,
          walletAddress: String(formData.get("walletAddress") ?? ""),
          qrCodeDataUrl,
          reason: String(formData.get("reason") ?? ""),
        }),
      });
      const payload = await readJson<
        DepositAccountMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not create package receiving account."),
        );
      }

      form.reset();
      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create package receiving account.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateAccount(
    event: FormEvent<HTMLFormElement>,
    account: DepositAccount,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const qrFile = formData.get("qr") as File | null;
    setBusy(`account-${account.id}`);
    setError(null);
    setNotice(null);

    try {
      const body: Record<string, unknown> = {
        expectedRevision: account.revision,
        isActive: formData.get("isActive") === "on",
        reason: String(formData.get("reason") ?? ""),
      };
      if (qrFile && qrFile.size > 0) {
        body.qrCodeDataUrl = await fileToDataUrl(qrFile);
      }

      const response = await fetch(
        `/api/admin/deposit-accounts/${account.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await readJson<
        DepositAccountMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not update deposit account."),
        );
      }

      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update deposit account.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function postAccounting(deposit: Deposit) {
    setBusy(`accounting-${deposit.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/deposits/${deposit.id}/post-accounting`,
        { method: "POST" },
      );

      const payload = await readJson<DepositAccountingResponse>(response);

      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Could not post deposit accounting."),
        );
      }

      const accountingMessage = messageFrom(
        payload,
        "Deposit accounting completed.",
      );
      const activationMessage = payload.packageActivation?.message;

      setNotice(
        activationMessage
          ? `${accountingMessage} ${activationMessage}`
          : accountingMessage,
      );
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not post deposit accounting.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function markReadyForApproval(deposit: Deposit) {
    const note = (reviewNotes[deposit.id] ?? "").trim();
    if (note.length < 3) {
      setError("A review note of at least 3 characters is required.");
      return;
    }

    setBusy(`ready-${deposit.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/deposits/${deposit.id}/ready-for-approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      const payload = await readJson<
        DepositMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Could not mark deposit ready."));
      }

      setReviewNotes((current) => ({ ...current, [deposit.id]: "" }));
      setNotice(payload.message);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not mark deposit ready for approval.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reviewDeposit(deposit: Deposit, action: "approve" | "reject") {
    const note = (reviewNotes[deposit.id] ?? "").trim();
    if (note.length < 3) {
      setError("A review note of at least 3 characters is required.");
      return;
    }

    setBusy(`${action}-${deposit.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/deposits/${deposit.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      const payload = await readJson<
        DepositMutationResponse & ApiMessagePayload
      >(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, `Could not ${action} deposit.`));
      }

      setReviewNotes((current) => ({ ...current, [deposit.id]: "" }));
      setSelectedApprovalIds((current) =>
        current.filter((id) => id !== deposit.id),
      );

      const policyResult =
        action === "approve" && payload.packageActivationMode
          ? ` Package activation: ${payload.packageActivationMode
              .split("_")
              .join(" ")}${
              payload.packageActivationTrigger
                ? ` · ${payload.packageActivationTrigger.split("_").join(" ")}`
                : ""
            }.`
          : "";

      setNotice(`${payload.message}${policyResult}`);
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not ${action} deposit.`,
      );
    } finally {
      setBusy(null);
    }
  }

  function toggleApprovalSelection(depositId: string) {
    setSelectedApprovalIds((current) =>
      current.includes(depositId)
        ? current.filter((id) => id !== depositId)
        : [...current, depositId],
    );
  }

  async function bulkApproveSelected() {
    if (!canApprove || selectedApprovalIds.length === 0) return;

    const note = bulkApprovalNote.trim();
    if (note.length < 3) {
      setError("A bulk approval note of at least 3 characters is required.");
      return;
    }

    const selected = deposits.filter(
      (deposit) =>
        isBulkApprovableStatus(deposit.status) &&
        selectedApprovalIds.includes(deposit.id),
    );
    if (selected.length !== selectedApprovalIds.length) {
      setError("One or more selected deposits changed state. Refresh and retry.");
      return;
    }

    const totals = new Map<string, string[]>();
    for (const deposit of selected) {
      totals.set(deposit.currency, [
        ...(totals.get(deposit.currency) ?? []),
        deposit.amount,
      ]);
    }
    const totalText = [...totals.entries()]
      .map(([currency, amounts]) => `${sumDecimalStrings(amounts)} ${currency}`)
      .join(", ");
    const directCount = selected.filter(
      (deposit) => deposit.status === "PENDING_REVIEW",
    ).length;
    const adminReviewedCount = selected.length - directCount;

    const confirmed = window.confirm(
      `Approve ${selected.length} deposit(s) totaling ${totalText}?\n\n` +
        `Selection: ${directCount} direct SUPER_ADMIN approval · ${adminReviewedCount} ADMIN-reviewed final approval.\n\n` +
        "Each deposit is processed independently and may post accounting, activate a package, and trigger downstream earnings automation.",
    );
    if (!confirmed) return;

    setBusy("bulk-approve");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/deposits/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositIds: selectedApprovalIds, note }),
      });
      const payload = await readJson<DepositBulkApprovalResponse>(response);
      if (!response.ok || !payload) {
        throw new Error(messageFrom(payload, "Bulk approval failed."));
      }

      setBulkApprovalNote("");
      setSelectedApprovalIds([]);
      const failures = payload.results.filter((result) => !result.ok);
      setNotice(
        failures.length === 0
          ? payload.message ?? "Bulk deposit approval completed."
          : `${payload.message ?? "Bulk deposit approval completed."} ${failures.length} item(s) require review.`,
      );
      await reloadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Bulk approval failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>DEP-02 / PACKAGE ROUTING</p>
          <h1>Deposit Operations</h1>
          <p>
            Configure supported asset/network rails, create one package-bound
            receiving account for each package, then review submitted transaction
            IDs. USER routing is configuration-driven; users do not choose the
            receiving account or payment network.
          </p>
        </div>
        <span className={styles.badge} data-tone="warning">
          {pendingCount} pending · {readyCount} ready
        </span>
      </section>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {canReadAccounts ? (
        <>
          <section className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Payment Rail Master</p>
                  <h2>Configure asset + network</h2>
                </div>
              </div>

              {canManageAccounts ? (
                <form className={styles.formGrid} onSubmit={createRail}>
                  <div className={styles.field}>
                    <label htmlFor="rail-asset">Asset / token</label>
                    <input
                      className={styles.input}
                      id="rail-asset"
                      name="asset"
                      defaultValue="USDT"
                      pattern="[A-Za-z0-9]{2,10}"
                      maxLength={10}
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="rail-network">Network code</label>
                    <input
                      className={styles.input}
                      id="rail-network"
                      name="networkCode"
                      placeholder="BEP20, TRC20, ETHEREUM..."
                      pattern="[A-Za-z0-9_-]{2,40}"
                      maxLength={40}
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="rail-name">Display name</label>
                    <input
                      className={styles.input}
                      id="rail-name"
                      name="displayName"
                      placeholder="USDT on BNB Smart Chain (BEP20)"
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="rail-profile">Validator profile</label>
                    <select
                      className={styles.select}
                      id="rail-profile"
                      name="validationProfile"
                      defaultValue="EVM"
                    >
                      {DEPOSIT_VALIDATION_PROFILES.map((profile) => (
                        <option key={profile} value={profile}>
                          {profile}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="rail-reason">Audit reason</label>
                    <input
                      className={styles.input}
                      id="rail-reason"
                      name="reason"
                      minLength={3}
                      maxLength={500}
                      required
                    />
                  </div>
                  <label className={`${styles.field} ${styles.full}`}>
                    <span>Initial state</span>
                    <span className={styles.actions}>
                      <input name="isActive" type="checkbox" defaultChecked />{" "}
                      Active
                    </span>
                  </label>
                  <div className={`${styles.actions} ${styles.full}`}>
                    <button
                      className={styles.button}
                      type="submit"
                      disabled={busy === "create-rail"}
                    >
                      {busy === "create-rail"
                        ? "Creating…"
                        : "Create payment rail"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.notice}>
                  Payment-rail management is read-only.
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Configured Rails</p>
                  <h2>{rails.length} payment rails</h2>
                </div>
              </div>
              <div className={styles.list}>
                {rails.length === 0 ? (
                  <div className={styles.empty}>
                    No payment rails configured.
                  </div>
                ) : (
                  rails.map((rail) => (
                    <div className={styles.row} key={rail.id}>
                      <div className={styles.rowTop}>
                        <div className={styles.rowTitle}>
                          <strong>{rail.displayName}</strong>
                          <small>
                            {rail.asset} · {rail.networkCode} ·{" "}
                            {rail.validationProfile}
                            {" · revision "}
                            {rail.revision}
                          </small>
                        </div>
                        <span
                          className={styles.badge}
                          data-tone={rail.isActive ? "success" : "danger"}
                        >
                          {rail.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                      {canManageAccounts ? (
                        <details>
                          <summary className={styles.muted}>Edit rail</summary>
                          <form
                            className={styles.formGrid}
                            onSubmit={(event) => updateRail(event, rail)}
                          >
                            <div className={styles.field}>
                              <label>Display name</label>
                              <input
                                className={styles.input}
                                name="displayName"
                                defaultValue={rail.displayName}
                                minLength={2}
                                maxLength={100}
                                required
                              />
                            </div>
                            <div className={styles.field}>
                              <label>Audit reason</label>
                              <input
                                className={styles.input}
                                name="reason"
                                minLength={3}
                                maxLength={500}
                                required
                              />
                            </div>
                            <label className={styles.field}>
                              <span>Availability</span>
                              <span className={styles.actions}>
                                <input
                                  name="isActive"
                                  type="checkbox"
                                  defaultChecked={rail.isActive}
                                />
                                Active
                              </span>
                            </label>
                            <div className={styles.actions}>
                              <button
                                className={styles.buttonSecondary}
                                type="submit"
                                disabled={busy === `rail-${rail.id}`}
                              >
                                {busy === `rail-${rail.id}`
                                  ? "Saving…"
                                  : "Save rail"}
                              </button>
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Receiving Accounts</p>
                  <h2>Create package receiving account</h2>
                  <p className={styles.muted}>
                    Choose the package first. The account is created ACTIVE and
                    bound to that package in one atomic operation.
                  </p>
                </div>
                {packageRoutes?.planVersionNumber ? (
                  <span className={styles.badge}>
                    PLAN V{packageRoutes.planVersionNumber}
                  </span>
                ) : null}
              </div>

              {canManageAccounts ? (
                activeRails.length === 0 ? (
                  <div className={styles.notice}>
                    Create or activate a payment rail before creating a package
                    receiving account.
                  </div>
                ) : unconfiguredPackages.length === 0 ? (
                  <div className={styles.notice}>
                    Every package in the effective catalogue already has a
                    receiving account. Edit the existing account below if its QR
                    or active state needs to change.
                  </div>
                ) : (
                  <form className={styles.formGrid} onSubmit={createAccount}>
                    <div className={styles.field}>
                      <label htmlFor="account-package">Package</label>
                      <select
                        className={styles.select}
                        id="account-package"
                        name="packageDefinitionId"
                        defaultValue={
                          unconfiguredPackages[0]?.packageDefinitionId ?? ""
                        }
                        required
                      >
                        {unconfiguredPackages.map((route) => (
                          <option
                            key={route.packageDefinitionId}
                            value={route.packageDefinitionId}
                          >
                            {route.displayName} · {route.currency}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="account-rail">Payment rail</label>
                      {activeRails.length === 1 ? (
                        <>
                          <input
                            className={styles.input}
                            id="account-rail"
                            value={`${activeRails[0].displayName} · ${activeRails[0].asset}/${activeRails[0].networkCode}`}
                            readOnly
                            aria-readonly="true"
                          />
                          <input
                            type="hidden"
                            name="paymentRailId"
                            value={activeRails[0].id}
                          />
                          <small className={styles.muted}>
                            Only one active payment rail is configured. A selector
                            appears automatically when multiple active rails exist.
                          </small>
                        </>
                      ) : (
                        <select
                          className={styles.select}
                          id="account-rail"
                          name="paymentRailId"
                          defaultValue={activeRails[0]?.id}
                          required
                        >
                          {activeRails.map((rail) => (
                            <option key={rail.id} value={rail.id}>
                              {rail.displayName} · {rail.asset}/{rail.networkCode}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className={`${styles.field} ${styles.full}`}>
                      <label htmlFor="account-address">
                        Public receiving address
                      </label>
                      <input
                        className={styles.input}
                        id="account-address"
                        name="walletAddress"
                        minLength={20}
                        maxLength={100}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                      />
                      <small className={styles.muted}>
                        Backend validates this address using the configured
                        payment rail&apos;s protocol profile.
                      </small>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="account-qr">Matching QR image</label>
                      <input
                        className={styles.input}
                        id="account-qr"
                        name="qr"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="account-reason">Audit reason</label>
                      <input
                        className={styles.input}
                        id="account-reason"
                        name="reason"
                        minLength={3}
                        maxLength={500}
                        required
                      />
                    </div>
                    <div className={`${styles.actions} ${styles.full}`}>
                      <button
                        className={styles.button}
                        type="submit"
                        disabled={busy === "create-account"}
                      >
                        {busy === "create-account"
                          ? "Creating…"
                          : "Create package account"}
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <div className={styles.notice}>
                  Receiving-account management is read-only.
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Package Accounts</p>
                  <h2>{accounts.length} receiving accounts</h2>
                </div>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  aria-expanded={packageAccountsOpen}
                  aria-controls="package-accounts-list"
                  onClick={() => setPackageAccountsOpen((current) => !current)}
                >
                  {packageAccountsOpen ? "Close accounts" : "Open accounts"}
                </button>
              </div>
              {packageAccountsOpen ? (
                <div className={styles.list} id="package-accounts-list">
                  {accounts.length === 0 ? (
                    <div className={styles.empty}>
                      No receiving accounts configured.
                    </div>
                  ) : (
                    accounts.map((account) => {
                      const mappedPackages = (packageRoutes?.packages ?? []).filter(
                        (route) => route.depositAccountId === account.id,
                      );
                      const mappedNames = mappedPackages
                        .map((route) => route.displayName)
                        .join(", ");

                      return (
                        <div className={styles.row} key={account.id}>
                          <div className={styles.rowTop}>
                            <div className={styles.rowTitle}>
                              <strong>{mappedNames || account.label}</strong>
                              <small>
                                {account.paymentRail.displayName} · revision{" "}
                                {account.revision}
                              </small>
                            </div>
                            <span
                              className={styles.badge}
                              data-tone={account.isActive ? "success" : "danger"}
                            >
                              {account.isActive ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </div>
                          <div className={styles.kv}>
                            <div>
                              <small>Package</small>
                              <strong>{mappedNames || "Legacy / unassigned"}</strong>
                            </div>
                            <div>
                              <small>Asset / network</small>
                              <strong>
                                {account.asset} · {account.network}
                              </strong>
                            </div>
                            <div>
                              <small>Public address</small>
                              <strong className={styles.mono}>
                                {account.walletAddress}
                              </strong>
                            </div>
                            <div>
                              <small>Updated</small>
                              <strong>{formatDate(account.updatedAt)}</strong>
                            </div>
                          </div>
                          {canManageAccounts ? (
                            <details>
                              <summary className={styles.muted}>
                                Edit account
                              </summary>
                              <form
                                className={styles.formGrid}
                                onSubmit={(event) =>
                                  updateAccount(event, account)
                                }
                              >
                                <div className={styles.field}>
                                  <label>Replace QR (optional)</label>
                                  <input
                                    className={styles.input}
                                    name="qr"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                  />
                                </div>
                                <div className={styles.field}>
                                  <label>Audit reason</label>
                                  <input
                                    className={styles.input}
                                    name="reason"
                                    minLength={3}
                                    maxLength={500}
                                    required
                                  />
                                </div>
                                <label className={styles.field}>
                                  <span>Assignment state</span>
                                  <span className={styles.actions}>
                                    <input
                                      name="isActive"
                                      type="checkbox"
                                      defaultChecked={account.isActive}
                                    />
                                    Active
                                  </span>
                                </label>
                                <div className={`${styles.actions} ${styles.full}`}>
                                  <button
                                    className={styles.buttonSecondary}
                                    type="submit"
                                    disabled={busy === `account-${account.id}`}
                                  >
                                    {busy === `account-${account.id}`
                                      ? "Saving…"
                                      : "Save changes"}
                                  </button>
                                </div>
                              </form>
                            </details>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {canReadDeposits ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Manual Review</p>
              <h2>Deposit queue</h2>
            </div>
            <div className={styles.actions}>
              <select
                className={styles.select}
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as DepositFilter)
                }
              >
                <option value="PENDING_REVIEW">Pending review</option>
                <option value="READY_FOR_APPROVAL">Ready for approval</option>
                <option value="AWAITING_TXID">Awaiting transaction ID</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">All</option>
              </select>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => void reloadWorkspace()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          {canApprove &&
          deposits.some((deposit) => isBulkApprovableStatus(deposit.status)) ? (
            <div className={styles.notice}>
              <strong>SUPER_ADMIN bulk approval</strong>
              <p>
                Select pending deposits for direct SUPER_ADMIN approval or
                ADMIN-reviewed deposits for final approval. Mixed selections are
                allowed, and every deposit is processed independently.
              </p>
              <div className={styles.field}>
                <label htmlFor="bulk-approval-note">Bulk approval note</label>
                <input
                  className={styles.input}
                  id="bulk-approval-note"
                  value={bulkApprovalNote}
                  onChange={(event) => setBulkApprovalNote(event.target.value)}
                  minLength={3}
                  maxLength={1000}
                />
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy !== null || selectedApprovalIds.length === 0}
                  onClick={() => void bulkApproveSelected()}
                >
                  {busy === "bulk-approve"
                    ? "Approving selected…"
                    : `Approve selected (${selectedApprovalIds.length})`}
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className={styles.empty}>Loading deposit state…</div>
          ) : deposits.length === 0 ? (
            <div className={styles.empty}>No deposits in this view.</div>
          ) : (
            <div className={styles.list}>
              {deposits.map((deposit) => (
                <div className={styles.row} key={deposit.id}>
                  <div className={styles.rowTop}>
                    <div className={styles.rowTitle}>
                      <strong>
                        {deposit.packageDisplayName} ·{" "}
                        {compactDecimal(deposit.amount)} {deposit.currency}
                      </strong>
                      <small>
                        {deposit.user?.username ?? deposit.userId} · created{" "}
                        {formatDate(deposit.createdAt)}
                      </small>
                    </div>
                    <div className={styles.actions}>
                      {canApprove && isBulkApprovableStatus(deposit.status) ? (
                        <label className={styles.muted}>
                          <input
                            type="checkbox"
                            checked={selectedApprovalIds.includes(deposit.id)}
                            onChange={() => toggleApprovalSelection(deposit.id)}
                            disabled={busy !== null}
                          />{" "}
                          Select
                        </label>
                      ) : null}
                      <span
                        className={styles.badge}
                        data-tone={statusTone(deposit.status)}
                      >
                        {statusLabel(deposit.status)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.kv}>
                    <div>
                      <small>Transaction ID</small>
                      <strong className={styles.mono}>
                        {deposit.txid ?? "Not submitted"}
                      </strong>
                    </div>
                    <div>
                      <small>Assigned account</small>
                      <strong>{deposit.assignedAccountLabel}</strong>
                    </div>
                    <div>
                      <small>Network</small>
                      <strong>{deposit.assignedNetwork}</strong>
                    </div>
                    <div>
                      <small>Receiving address</small>
                      <strong className={styles.mono}>
                        {deposit.assignedWalletAddress}
                      </strong>
                    </div>
                  </div>
                  {deposit.readyForApprovalAt ? (
                    <div className={styles.notice}>
                      ADMIN review: {deposit.readyForApprovalNote} · marked ready by{" "}
                      {deposit.readyForApprovalBy?.username ??
                        deposit.readyForApprovalByUserId}{" "}
                      · {formatDate(deposit.readyForApprovalAt)}
                    </div>
                  ) : null}
                  {deposit.reviewNote ? (
                    <div className={styles.notice}>
                      Final review: {deposit.reviewNote} ·{" "}
                      {formatDate(deposit.reviewedAt)}
                    </div>
                  ) : null}
                  {deposit.status === "APPROVED" && canPostAccounting ? (
                    <div className={styles.notice}>
                      <strong>Accounting / activation recovery</strong>
                      <p>
                        Posting is idempotent: an already-posted deposit is not
                        double-credited. After accounting, package activation
                        follows this deposit&apos;s immutable AUTO or MANUAL plan
                        policy.
                      </p>
                      <div className={styles.actions}>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void postAccounting(deposit)}
                        >
                          {busy === `accounting-${deposit.id}`
                            ? "Posting…"
                            : "Post / reconcile accounting"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {deposit.status === "PENDING_REVIEW" && canReview ? (
                    <div className={styles.formGrid}>
                      <div className={`${styles.field} ${styles.full}`}>
                        <label htmlFor={`review-${deposit.id}`}>
                          {canApprove
                            ? "Final approval / rejection note"
                            : "Review note"}
                        </label>
                        <textarea
                          className={styles.textarea}
                          id={`review-${deposit.id}`}
                          value={reviewNotes[deposit.id] ?? ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [deposit.id]: event.target.value,
                            }))
                          }
                          minLength={3}
                          maxLength={1000}
                        />
                      </div>
                      <div className={`${styles.actions} ${styles.full}`}>
                        {canMarkReady ? (
                          <button
                            className={styles.button}
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void markReadyForApproval(deposit)}
                          >
                            {busy === `ready-${deposit.id}`
                              ? "Marking ready…"
                              : "Mark ready for approval"}
                          </button>
                        ) : canApprove ? (
                          <>
                            <button
                              className={styles.button}
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                void reviewDeposit(deposit, "approve")
                              }
                            >
                              {busy === `approve-${deposit.id}`
                                ? "Approving…"
                                : "Approve directly"}
                            </button>
                            <span className={styles.muted}>
                              ADMIN pre-review is optional for SUPER_ADMIN final
                              approval.
                            </span>
                          </>
                        ) : (
                          <span className={styles.muted}>
                            Awaiting ADMIN or SUPER_ADMIN review.
                          </span>
                        )}
                        <button
                          className={styles.buttonDanger}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void reviewDeposit(deposit, "reject")}
                        >
                          {busy === `reject-${deposit.id}`
                            ? "Rejecting…"
                            : "Reject"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {deposit.status === "READY_FOR_APPROVAL" && canReview ? (
                    <div className={styles.formGrid}>
                      <div className={`${styles.field} ${styles.full}`}>
                        <label htmlFor={`final-review-${deposit.id}`}>
                          {canApprove
                            ? "Final approval / rejection note"
                            : "Rejection note"}
                        </label>
                        <textarea
                          className={styles.textarea}
                          id={`final-review-${deposit.id}`}
                          value={reviewNotes[deposit.id] ?? ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [deposit.id]: event.target.value,
                            }))
                          }
                          minLength={3}
                          maxLength={1000}
                        />
                      </div>
                      <div className={`${styles.actions} ${styles.full}`}>
                        {canApprove ? (
                          <button
                            className={styles.button}
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              void reviewDeposit(deposit, "approve")
                            }
                          >
                            {busy === `approve-${deposit.id}`
                              ? "Approving…"
                              : "Approve"}
                          </button>
                        ) : (
                          <span className={styles.muted}>
                            Ready for SUPER_ADMIN final approval.
                          </span>
                        )}
                        <button
                          className={styles.buttonDanger}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void reviewDeposit(deposit, "reject")}
                        >
                          {busy === `reject-${deposit.id}`
                            ? "Rejecting…"
                            : "Reject"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className={styles.notice}>
          Deposit review access requires <code>deposits.read</code>.
        </div>
      )}
    </div>
  );
}
