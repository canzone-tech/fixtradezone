"use client";

import { useEffect, useState, type FormEvent } from "react";
import styles from "@/components/deposits/deposits.module.css";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  type ApiMessagePayload,
  type DepositAccount,
  type DepositAccountsResponse,
  messageFrom,
  readJson,
} from "@/lib/deposits";

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

function isSuperAdmin(user: AdminUser): boolean {
  return user.roles.includes("SUPER_ADMIN");
}

function hasPermission(user: AdminUser, permission: string): boolean {
  return isSuperAdmin(user) || user.permissions.includes(permission);
}

async function fetchPanelState() {
  const session = await resolveAdminSession();
  if (!session.user) {
    throw new Error(session.message ?? "Administrator session is unavailable.");
  }

  const user = session.user;
  const canRead = hasPermission(user, "deposits.accounts.read");
  if (!canRead) {
    return {
      user,
      routes: null,
      accounts: [] as DepositAccount[],
    };
  }

  const [routeResponse, accountResponse] = await Promise.all([
    fetch("/api/admin/deposit-package-accounts", { cache: "no-store" }),
    fetch("/api/admin/deposit-accounts", { cache: "no-store" }),
  ]);

  const routePayload = await readJson<PackageAccountRoutesResponse>(routeResponse);
  const accountPayload = await readJson<DepositAccountsResponse & ApiMessagePayload>(
    accountResponse,
  );

  if (!routeResponse.ok || !routePayload) {
    throw new Error(
      messageFrom(routePayload, "Could not load package receiving-account routes."),
    );
  }
  if (!accountResponse.ok || !accountPayload) {
    throw new Error(
      messageFrom(accountPayload, "Could not load receiving accounts."),
    );
  }

  return {
    user,
    routes: routePayload,
    accounts: accountPayload.accounts,
  };
}

export default function PackageAccountRoutingPanel() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [routes, setRoutes] = useState<PackageAccountRoutesResponse | null>(null);
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage =
    user !== null && hasPermission(user, "deposits.accounts.manage");

  async function reloadPanel() {
    const state = await fetchPanelState();
    setUser(state.user);
    setRoutes(state.routes);
    setAccounts(state.accounts);
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const state = await fetchPanelState();
        if (!mounted) return;
        setUser(state.user);
        setRoutes(state.routes);
        setAccounts(state.accounts);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load package receiving-account routes.",
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
  }, []);

  async function saveRoute(
    event: FormEvent<HTMLFormElement>,
    route: PackageAccountRoute,
  ) {
    event.preventDefault();
    if (!canManage || busy !== null) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const selected = String(formData.get("depositAccountId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    setBusy(route.packageDefinitionId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/deposit-package-accounts/${encodeURIComponent(route.packageDefinitionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            depositAccountId: selected || null,
            reason,
          }),
        },
      );
      const payload = await readJson<ApiMessagePayload>(response);
      if (!response.ok) {
        throw new Error(
          messageFrom(payload, "Could not save package receiving account."),
        );
      }

      setNotice(
        typeof payload?.message === "string"
          ? payload.message
          : "Package receiving account saved.",
      );
      form.reset();
      await reloadPanel();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save package receiving account.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (user && !hasPermission(user, "deposits.accounts.read")) return null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Package Receiving Routes</p>
          <h2>One receiving account per package</h2>
          <p className={styles.muted}>
            Each package resolves to exactly one configured receiving account.
            The same account may be used by more than one package.
          </p>
        </div>
        {routes?.planVersionNumber ? (
          <span className={styles.badge}>PLAN V{routes.planVersionNumber}</span>
        ) : null}
      </div>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.empty}>Loading package receiving routes…</div>
      ) : !routes ? (
        <div className={styles.notice}>
          Package receiving routes are unavailable for this role.
        </div>
      ) : routes.packages.length === 0 ? (
        <div className={styles.empty}>
          No effective published package catalogue is available.
        </div>
      ) : (
        <div className={styles.list}>
          {routes.packages.map((route) => {
            const currentAccount =
              accounts.find((account) => account.id === route.depositAccountId) ??
              null;
            const eligibleAccounts = accounts.filter(
              (account) =>
                account.asset === route.currency &&
                (account.isActive || account.id === route.depositAccountId),
            );

            return (
              <div className={styles.row} key={route.packageDefinitionId}>
                <div className={styles.rowTop}>
                  <div className={styles.rowTitle}>
                    <strong>
                      {String(route.sortOrder).padStart(2, "0")} · {route.displayName}
                    </strong>
                    <small>
                      {route.packageCode} · {route.currency} · {route.availability}
                    </small>
                  </div>
                  <span
                    className={styles.badge}
                    data-tone={currentAccount?.isActive ? "success" : "warning"}
                  >
                    {currentAccount?.isActive ? "CONFIGURED" : "ACTION REQUIRED"}
                  </span>
                </div>

                <div className={styles.kv}>
                  <div>
                    <small>Current receiving account</small>
                    <strong>{currentAccount?.label ?? "Not configured"}</strong>
                  </div>
                  <div>
                    <small>Network</small>
                    <strong>{currentAccount?.network ?? "—"}</strong>
                  </div>
                  <div className={styles.full}>
                    <small>Public address</small>
                    <strong className={styles.mono}>
                      {currentAccount?.walletAddress ?? "—"}
                    </strong>
                  </div>
                </div>

                {canManage ? (
                  <form
                    className={styles.formGrid}
                    onSubmit={(event) => saveRoute(event, route)}
                  >
                    <div className={styles.field}>
                      <label htmlFor={`package-account-${route.packageDefinitionId}`}>
                        Receiving account
                      </label>
                      <select
                        className={styles.select}
                        id={`package-account-${route.packageDefinitionId}`}
                        name="depositAccountId"
                        defaultValue={route.depositAccountId ?? ""}
                      >
                        <option value="">Not configured</option>
                        {eligibleAccounts.map((account) => (
                          <option
                            key={account.id}
                            value={account.id}
                            disabled={!account.isActive || !account.paymentRail.isActive}
                          >
                            {account.label} · {account.asset}/{account.network}
                            {!account.isActive || !account.paymentRail.isActive
                              ? " · INACTIVE"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`package-route-reason-${route.packageDefinitionId}`}>
                        Audit reason
                      </label>
                      <input
                        className={styles.input}
                        id={`package-route-reason-${route.packageDefinitionId}`}
                        name="reason"
                        minLength={3}
                        maxLength={500}
                        required
                      />
                    </div>
                    <div className={`${styles.actions} ${styles.full}`}>
                      <button
                        className={styles.buttonSecondary}
                        type="submit"
                        disabled={busy !== null}
                      >
                        {busy === route.packageDefinitionId
                          ? "Saving…"
                          : "Save package route"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.notice}>
                    Package receiving-account configuration is read-only.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
