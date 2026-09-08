"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./internal-trading.module.css";

interface ApiMessage {
  message?: string | string[];
}

interface TimingWindow {
  start: string;
  end: string;
}

interface Policy {
  id: string;
  versionNumber: number;
  status: "DRAFT" | "PUBLISHED";
  revision: number;
  enabled: boolean;
  activitiesPerDay: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: TimingWindow[];
  userSharePercent: string;
  adminSharePercent: string;
  timezoneSnapshot: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
}

interface StateRow {
  subscriptionId: string;
  userId: string;
  username?: string;
  email?: string | null;
  packageCode: string;
  packageDisplayName: string;
  currency: string;
  principalAmount: string;
  grossMultiplier: string;
  grossTarget: string;
  userSharePercent: string;
  adminSharePercent: string;
  timezoneSnapshot: string;
  activationLocalDate: string;
  finalLocalDate: string;
  grossNetProgress: string;
  grossHighWaterMark: string;
  userCreditedAmount: string;
  adminRecognizedAmount: string;
  nextTradeLocalDate: string;
  settledTradeCount: number;
  status: "ACTIVE" | "COMPLETED" | "BLOCKED";
  blockedReason: string | null;
}

interface Workspace {
  total: number;
  totals: {
    active: number;
    completed: number;
    blocked: number;
    principal: string;
    grossTarget: string;
    userCredited: string;
    adminRecognized: string;
  };
  states: StateRow[];
}

interface TradeEvent {
  id: string;
  localTradeDate: string;
  tradeDayNumber: number;
  slotNumber: number;
  scheduledAt: string;
  assetSymbol: string;
  outcome: "WIN" | "LOSS";
  eventType: "NORMAL" | "TARGET_RECONCILIATION";
  resultPercent: string;
  grossResultAmount: string;
  grossProgressAfter: string;
  grossHighWaterAfter: string;
  grossSettlementAmount: string;
  userShareAmount: string;
  adminShareAmount: string;
  ledgerTransactionId: string | null;
}

interface EventsPayload {
  total: number;
  events: TradeEvent[];
}

interface FormState {
  enabled: boolean;
  activitiesPerDay: string;
  assetSymbols: string;
  winWeight: string;
  lossWeight: string;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: string;
  userSharePercent: string;
  adminSharePercent: string;
  reason: string;
}

const EMPTY_FORM: FormState = {
  enabled: true,
  activitiesPerDay: "5",
  assetSymbols: "BTCUSDT, ETHUSDT, SOLUSDT",
  winWeight: "3",
  lossWeight: "2",
  winMinimumPercent: "0.500000",
  winMaximumPercent: "2.500000",
  lossMinimumPercent: "0.250000",
  lossMaximumPercent: "1.500000",
  timingWindows: "09:00-21:00",
  userSharePercent: "70.000000",
  adminSharePercent: "30.000000",
  reason: "",
};

async function json<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const message = payload.message;

  if (typeof message === "string") return message;

  if (Array.isArray(message) && typeof message[0] === "string") {
    return message[0];
  }

  return fallback;
}

function parseWindows(value: string): TimingWindow[] {
  return value
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(line);

      if (!match) {
        throw new Error("Timing window format must be HH:MM-HH:MM.");
      }

      return { start: match[1], end: match[2] };
    });
}

function formFor(policy: Policy): FormState {
  return {
    enabled: policy.enabled,
    activitiesPerDay: String(policy.activitiesPerDay),
    assetSymbols: policy.assetSymbols.join(", "),
    winWeight: String(policy.winWeight),
    lossWeight: String(policy.lossWeight),
    winMinimumPercent: policy.winMinimumPercent,
    winMaximumPercent: policy.winMaximumPercent,
    lossMinimumPercent: policy.lossMinimumPercent,
    lossMaximumPercent: policy.lossMaximumPercent,
    timingWindows: policy.timingWindows
      .map((window) => `${window.start}-${window.end}`)
      .join("\n"),
    userSharePercent: policy.userSharePercent,
    adminSharePercent: policy.adminSharePercent,
    reason: "",
  };
}

function tone(status: StateRow["status"]) {
  if (status === "ACTIVE") return "success";
  if (status === "BLOCKED") return "danger";
  return "muted";
}

function money(value: string, currency = "") {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  })}${currency ? ` ${currency}` : ""}`;
}

export default function InternalTradingAdminClient() {
  const router = useRouter();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  const canReconcile =
    isSuperAdmin ||
    user?.permissions.includes("internal_trading.reconcile") === true;

  const draft = useMemo(
    () => policies.find((policy) => policy.status === "DRAFT") ?? null,
    [policies],
  );

  const published = useMemo(
    () => policies.find((policy) => policy.status === "PUBLISHED") ?? null,
    [policies],
  );

  const selected = useMemo(
    () =>
      workspace?.states.find((state) => state.subscriptionId === selectedId) ??
      null,
    [workspace, selectedId],
  );

  const loadEvents = useCallback(async (subscriptionId: string) => {
    const response = await fetch(
      `/api/admin/internal-trading/subscriptions/${encodeURIComponent(
        subscriptionId,
      )}/events?page=1&limit=100`,
      { cache: "no-store" },
    );

    const payload = await json<EventsPayload & ApiMessage>(response);

    if (!response.ok || !payload) {
      throw new Error(
        messageFrom(payload, "Unable to load internal trade events."),
      );
    }

    setEvents(payload.events);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setError("");

    const sessionResponse = await fetch("/api/auth/session", {
      cache: "no-store",
    });

    const session = await json<{ user?: AdminUser } & ApiMessage>(
      sessionResponse,
    );

    if (sessionResponse.status === 401 || sessionResponse.status === 403) {
      router.replace("/login");
      router.refresh();
      return;
    }

    if (!sessionResponse.ok || !session?.user) {
      throw new Error(
        messageFrom(session, "Unable to load administrator session."),
      );
    }

    setUser(session.user);

    const [policyResponse, workspaceResponse] = await Promise.all([
      fetch("/api/admin/internal-trading/policies", {
        cache: "no-store",
      }),
      fetch("/api/admin/internal-trading/workspace?page=1&limit=100", {
        cache: "no-store",
      }),
    ]);

    const policyPayload = await json<{ policies: Policy[] } & ApiMessage>(
      policyResponse,
    );

    const workspacePayload = await json<Workspace & ApiMessage>(
      workspaceResponse,
    );

    if (!policyResponse.ok || !policyPayload) {
      throw new Error(
        messageFrom(policyPayload, "Unable to load trading policy."),
      );
    }

    if (!workspaceResponse.ok || !workspacePayload) {
      throw new Error(
        messageFrom(workspacePayload, "Unable to load trading workspace."),
      );
    }

    setPolicies(policyPayload.policies);
    setWorkspace(workspacePayload);

    const activeDraft =
      policyPayload.policies.find((policy) => policy.status === "DRAFT") ??
      null;

    const currentPublished =
      policyPayload.policies.find((policy) => policy.status === "PUBLISHED") ??
      null;

    setForm(
      formFor(activeDraft ?? currentPublished ?? policyPayload.policies[0]),
    );

    if (!selectedId && workspacePayload.states[0]) {
      const firstId = workspacePayload.states[0].subscriptionId;
      setSelectedId(firstId);
      await loadEvents(firstId);
    }
  }, [loadEvents, router, selectedId]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        await loadWorkspace();
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load internal trading.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadWorkspace]);

  async function selectState(subscriptionId: string) {
    setSelectedId(subscriptionId);
    setError("");

    try {
      await loadEvents(subscriptionId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load events.",
      );
    }
  }

  async function mutate(url: string, body: unknown, successMessage: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await json<ApiMessage>(response);

      if (!response.ok) {
        throw new Error(messageFrom(payload, successMessage));
      }

      setNotice(messageFrom(payload, successMessage));
      await loadWorkspace();

      if (selectedId) await loadEvents(selectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!published) return;

    await mutate(
      "/api/admin/internal-trading/policies",
      {
        sourcePolicyVersionId: published.id,
        reason: form.reason || "Prepare next internal trading policy.",
      },
      "Internal trading policy draft created.",
    );
  }

  async function saveDraft() {
    if (!draft) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/internal-trading/policies/${encodeURIComponent(draft.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draft.revision,
            reason: form.reason || "Update internal trading policy.",
            enabled: form.enabled,
            activitiesPerDay: Number(form.activitiesPerDay),
            assetSymbols: form.assetSymbols
              .split(/[,\n]+/)
              .map((asset) => asset.trim().toUpperCase())
              .filter(Boolean),
            winWeight: Number(form.winWeight),
            lossWeight: Number(form.lossWeight),
            winMinimumPercent: form.winMinimumPercent,
            winMaximumPercent: form.winMaximumPercent,
            lossMinimumPercent: form.lossMinimumPercent,
            lossMaximumPercent: form.lossMaximumPercent,
            timingWindows: parseWindows(form.timingWindows),
            userSharePercent: form.userSharePercent,
            adminSharePercent: form.adminSharePercent,
          }),
        },
      );

      const payload = await json<ApiMessage>(response);

      if (!response.ok) {
        throw new Error(messageFrom(payload, "Unable to save policy draft."));
      }

      setNotice("Internal trading policy draft saved.");
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!draft) return;

    await mutate(
      `/api/admin/internal-trading/policies/${encodeURIComponent(
        draft.id,
      )}/publish`,
      {
        expectedRevision: draft.revision,
        reason: form.reason || "Publish internal trading policy.",
      },
      "Internal trading policy published.",
    );
  }

  if (loading && !workspace) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading internal trading…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ITD / INTERNAL TRADING</p>
          <h2>Internal Trading</h2>
          <p>
            Manage package-linked internal trading, global trade policy, package
            progress, immediate WIN settlements and immutable trade history.
          </p>
        </div>

        <span className={styles.modelPill}>
          PRINCIPAL BASIS · GROSS BEFORE SPLIT
        </span>
      </section>

      {error ? (
        <div className={styles.alert} data-tone="error">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className={styles.alert} data-tone="success">
          {notice}
        </div>
      ) : null}

      <section className={styles.stats}>
        <div className={styles.stat}>
          <small>Active packages</small>
          <strong>{workspace?.totals.active ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <small>Completed</small>
          <strong>{workspace?.totals.completed ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <small>Total principal</small>
          <strong>{money(workspace?.totals.principal ?? "0")}</strong>
        </div>
        <div className={styles.stat}>
          <small>User credited</small>
          <strong>{money(workspace?.totals.userCredited ?? "0")}</strong>
        </div>
        <div className={styles.stat}>
          <small>Admin recognized</small>
          <strong>{money(workspace?.totals.adminRecognized ?? "0")}</strong>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Global Trading Policy</h3>
              <p className={styles.muted}>
                SuperAdmin global configuration. Package override is not used.
              </p>
            </div>

            <span
              className={styles.badge}
              data-tone={draft ? "warning" : "success"}
            >
              {draft
                ? `DRAFT V${draft.versionNumber}`
                : published
                  ? `PUBLISHED V${published.versionNumber}`
                  : "NO POLICY"}
            </span>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.enabled}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              Trading enabled
            </label>

            <div className={styles.field}>
              <label>Trades per day</label>
              <input
                value={form.activitiesPerDay}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    activitiesPerDay: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.fieldWide}>
              <label>Assets</label>
              <input
                value={form.assetSymbols}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assetSymbols: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>WIN weight · 3 = 60%</label>
              <input
                value={form.winWeight}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    winWeight: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>LOSS weight · 2 = 40%</label>
              <input
                value={form.lossWeight}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lossWeight: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>WIN % minimum</label>
              <input
                value={form.winMinimumPercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    winMinimumPercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>WIN % maximum</label>
              <input
                value={form.winMaximumPercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    winMaximumPercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>LOSS % minimum</label>
              <input
                value={form.lossMinimumPercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lossMinimumPercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>LOSS % maximum</label>
              <input
                value={form.lossMaximumPercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lossMaximumPercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>User share %</label>
              <input
                value={form.userSharePercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    userSharePercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.field}>
              <label>Admin share %</label>
              <input
                value={form.adminSharePercent}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    adminSharePercent: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.fieldWide}>
              <label>Timing windows</label>
              <textarea
                value={form.timingWindows}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timingWindows: event.target.value,
                  }))
                }
              />
            </div>

            <div className={styles.fieldWide}>
              <label>Change reason</label>
              <textarea
                value={form.reason}
                disabled={!isSuperAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {isSuperAdmin ? (
            <div className={styles.actions}>
              {!draft && published ? (
                <button
                  className={styles.buttonSecondary}
                  disabled={busy}
                  onClick={createDraft}
                >
                  Create Draft
                </button>
              ) : null}

              {draft ? (
                <>
                  <button
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={saveDraft}
                  >
                    Save Draft
                  </button>

                  <button
                    className={styles.buttonWarning}
                    disabled={busy}
                    onClick={publishDraft}
                  >
                    Publish for Next Trading Day
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Effective Policy</h3>
            <span className={styles.badge} data-tone="success">
              GLOBAL
            </span>
          </div>

          {published ? (
            <dl className={styles.detailList}>
              <div>
                <dt>Version</dt>
                <dd>V{published.versionNumber}</dd>
              </div>
              <div>
                <dt>Trades / day</dt>
                <dd>{published.activitiesPerDay}</dd>
              </div>
              <div>
                <dt>Split</dt>
                <dd>
                  {published.userSharePercent}% / {published.adminSharePercent}%
                </dd>
              </div>
              <div>
                <dt>Assets</dt>
                <dd>{published.assetSymbols.join(", ")}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{published.timezoneSnapshot ?? "Pending publication"}</dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>
                  {published.effectiveFrom
                    ? formatPlatformDateTime(published.effectiveFrom)
                    : "Not effective"}
                </dd>
              </div>
            </dl>
          ) : (
            <div className={styles.empty}>No published policy.</div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Package Trading States</h3>
            <p className={styles.muted}>
              Every ACTIVE package runs independently.
            </p>
          </div>
          <span className={styles.badge} data-tone="muted">
            {workspace?.total ?? 0} PACKAGE(S)
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Package</th>
                <th>Status</th>
                <th>Principal</th>
                <th>Target</th>
                <th>Progress</th>
                <th>High-water</th>
                <th>User credited</th>
                <th>Admin share</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {workspace?.states.map((state) => (
                <tr
                  key={state.subscriptionId}
                  className={`${styles.clickable} ${
                    selectedId === state.subscriptionId ? styles.selected : ""
                  }`}
                  onClick={() => void selectState(state.subscriptionId)}
                >
                  <td>
                    <strong>{state.username ?? state.userId}</strong>
                    <br />
                    <span className={styles.muted}>{state.email ?? ""}</span>
                  </td>
                  <td>{state.packageDisplayName}</td>
                  <td>
                    <span
                      className={styles.badge}
                      data-tone={tone(state.status)}
                    >
                      {state.status}
                    </span>
                  </td>
                  <td>{money(state.principalAmount, state.currency)}</td>
                  <td>{money(state.grossTarget, state.currency)}</td>
                  <td>{money(state.grossNetProgress, state.currency)}</td>
                  <td>{money(state.grossHighWaterMark, state.currency)}</td>
                  <td>{money(state.userCreditedAmount, state.currency)}</td>
                  <td>{money(state.adminRecognizedAmount, state.currency)}</td>
                  <td>{state.settledTradeCount}</td>
                </tr>
              ))}

              {!workspace?.states.length ? (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    No internal trading package states yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>{selected.packageDisplayName}</h3>
                <p className={styles.muted}>
                  {selected.username ?? selected.userId}
                </p>
              </div>

              <span className={styles.badge} data-tone={tone(selected.status)}>
                {selected.status}
              </span>
            </div>

            <dl className={styles.detailList}>
              <div>
                <dt>Subscription</dt>
                <dd className={styles.mono}>{selected.subscriptionId}</dd>
              </div>
              <div>
                <dt>Principal</dt>
                <dd>{money(selected.principalAmount, selected.currency)}</dd>
              </div>
              <div>
                <dt>Multiplier</dt>
                <dd>{selected.grossMultiplier}x</dd>
              </div>
              <div>
                <dt>Gross target</dt>
                <dd>{money(selected.grossTarget, selected.currency)}</dd>
              </div>
              <div>
                <dt>Gross progress</dt>
                <dd>{money(selected.grossNetProgress, selected.currency)}</dd>
              </div>
              <div>
                <dt>Progress high-water</dt>
                <dd>{money(selected.grossHighWaterMark, selected.currency)}</dd>
              </div>
              <div>
                <dt>Activation day</dt>
                <dd>{selected.activationLocalDate}</dd>
              </div>
              <div>
                <dt>Final day</dt>
                <dd>{selected.finalLocalDate}</dd>
              </div>
              <div>
                <dt>Next trading day</dt>
                <dd>{selected.nextTradeLocalDate}</dd>
              </div>
            </dl>

            {canReconcile ? (
              <>
                <p className={styles.muted}>
                  Recovery actions · automatic worker is the normal processing
                  path.
                </p>
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/api/admin/internal-trading/subscriptions/${encodeURIComponent(
                          selected.subscriptionId,
                        )}/reconcile-state`,
                        {},
                        "Internal trading state reconciled.",
                      )
                    }
                  >
                    Reconcile State
                  </button>

                  <button
                    className={styles.button}
                    disabled={busy || selected.status !== "ACTIVE"}
                    onClick={() =>
                      void mutate(
                        `/api/admin/internal-trading/subscriptions/${encodeURIComponent(
                          selected.subscriptionId,
                        )}/reconcile-trades`,
                        {},
                        "Due internal trades processed as recovery.",
                      )
                    }
                  >
                    Process Due Trades Now
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Financial Snapshot</h3>
              <span className={styles.badge} data-tone="success">
                HIGH-WATER
              </span>
            </div>

            <dl className={styles.detailList}>
              <div>
                <dt>User split</dt>
                <dd>{selected.userSharePercent}%</dd>
              </div>
              <div>
                <dt>Admin split</dt>
                <dd>{selected.adminSharePercent}%</dd>
              </div>
              <div>
                <dt>User credited</dt>
                <dd className={styles.moneyPositive}>
                  {money(selected.userCreditedAmount, selected.currency)}
                </dd>
              </div>
              <div>
                <dt>Admin recognized</dt>
                <dd>
                  {money(selected.adminRecognizedAmount, selected.currency)}
                </dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{selected.timezoneSnapshot}</dd>
              </div>
              <div>
                <dt>Blocked reason</dt>
                <dd>{selected.blockedReason ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Trade History</h3>
            <p className={styles.muted}>
              Immutable package-linked internal trade events.
            </p>
          </div>

          <span className={styles.badge} data-tone="muted">
            {events.length} LOADED
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day / Slot</th>
                <th>Asset</th>
                <th>Result</th>
                <th>%</th>
                <th>Gross result</th>
                <th>Progress</th>
                <th>Settlement</th>
                <th>User</th>
                <th>Admin</th>
                <th>Ledger</th>
              </tr>
            </thead>

            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.localTradeDate}</td>
                  <td>
                    D{event.tradeDayNumber} / {event.slotNumber}
                  </td>
                  <td>{event.assetSymbol}</td>
                  <td>
                    <span
                      className={
                        event.outcome === "WIN" ? styles.win : styles.loss
                      }
                    >
                      {event.eventType === "TARGET_RECONCILIATION"
                        ? "TARGET CLOSE"
                        : event.outcome}
                    </span>
                  </td>
                  <td>{event.resultPercent}%</td>
                  <td>{event.grossResultAmount}</td>
                  <td>{event.grossProgressAfter}</td>
                  <td>{event.grossSettlementAmount}</td>
                  <td>{event.userShareAmount}</td>
                  <td>{event.adminShareAmount}</td>
                  <td className={styles.mono}>
                    {event.ledgerTransactionId
                      ? event.ledgerTransactionId.slice(0, 12)
                      : "NO POST"}
                  </td>
                </tr>
              ))}

              {!events.length ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    Select a package to view immutable trade history.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
