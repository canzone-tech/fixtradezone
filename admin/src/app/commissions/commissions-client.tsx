"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type {
  CommissionEvent,
  CommissionLevelRule,
  CommissionPlan,
  CommissionReconciliationItem,
} from "@/lib/commissions";
import styles from "./commissions.module.css";

interface ApiError {
  message?: string | string[];
}

interface PlanListResponse {
  plans: CommissionPlan[];
}

interface EventListResponse {
  commissions: CommissionEvent[];
}

interface ReconciliationResponse {
  subscriptions: CommissionReconciliationItem[];
}

interface ProcessResponse {
  created: boolean;
  run: { id: string; outcome: string };
  events: CommissionEvent[];
}

function apiMessage(payload: ApiError, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function amountLabel(value: string, currency: string) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function draftSnapshot(plan: CommissionPlan) {
  return {
    firstPurchaseEnabled: plan.firstPurchaseEnabled,
    newPurchaseEnabled: plan.newPurchaseEnabled,
    activePackageRequired: plan.activePackageRequired,
    inactiveUplineAction: plan.inactiveUplineAction,
    compressionMode: plan.compressionMode,
    releaseMode: plan.releaseMode,
    holdPeriodHours: plan.holdPeriodHours,
    levels: plan.levels.map((level) => ({
      level: level.level,
      enabled: level.enabled,
      ratePercent: level.ratePercent,
      packageMatchingEnabled: level.packageMatchingEnabled,
    })),
  };
}

type DraftState = ReturnType<typeof draftSnapshot>;

export default function CommissionsClient() {
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const selectedPlanIdRef = useRef("");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [events, setEvents] = useState<CommissionEvent[]>([]);
  const [pending, setPending] = useState<CommissionReconciliationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canReconcile, setCanReconcile] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId],
  );

  const dirty = useMemo(() => {
    if (!selectedPlan || !draft || selectedPlan.status !== "DRAFT") return false;
    return JSON.stringify(draft) !== JSON.stringify(draftSnapshot(selectedPlan));
  }, [draft, selectedPlan]);

  const load = useCallback(async () => {
    setError(null);
    const [planResponse, eventResponse, reconciliationResponse] = await Promise.all([
      fetch("/api/admin/commission-plans", { cache: "no-store" }),
      fetch("/api/admin/commissions?limit=100", { cache: "no-store" }),
      fetch("/api/admin/commissions/reconciliation?limit=100", {
        cache: "no-store",
      }),
    ]);

    const planPayload = (await planResponse
      .json()
      .catch(() => ({}))) as PlanListResponse & ApiError;
    const eventPayload = (await eventResponse
      .json()
      .catch(() => ({}))) as EventListResponse & ApiError;
    const reconciliationPayload = (await reconciliationResponse
      .json()
      .catch(() => ({}))) as ReconciliationResponse & ApiError;

    if (!planResponse.ok) {
      throw new Error(apiMessage(planPayload, "Unable to load commission plans."));
    }
    if (!eventResponse.ok) {
      throw new Error(
        apiMessage(eventPayload, "Unable to load referral commissions."),
      );
    }
    if (!reconciliationResponse.ok && reconciliationResponse.status !== 403) {
      throw new Error(
        apiMessage(
          reconciliationPayload,
          "Unable to load commission reconciliation queue.",
        ),
      );
    }

    const nextPlans = planPayload.plans ?? [];
    const nextSelected =
      nextPlans.find((plan) => plan.id === selectedPlanIdRef.current) ??
      nextPlans[0] ??
      null;

    setPlans(nextPlans);
    setEvents(eventPayload.commissions ?? []);
    setPending(
      reconciliationResponse.ok ? reconciliationPayload.subscriptions ?? [] : [],
    );
    selectedPlanIdRef.current = nextSelected?.id ?? "";
    setSelectedPlanId(nextSelected?.id ?? "");
    setDraft(nextSelected ? draftSnapshot(nextSelected) : null);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const session = await resolveAdminSession();
        if (!mounted) return;
        const superAdmin = session.user?.roles.includes("SUPER_ADMIN") ?? false;
        const permissions = session.user?.permissions ?? [];
        setIsSuperAdmin(superAdmin);
        setCanManage(
          superAdmin || permissions.includes("commissions.plan.manage"),
        );
        setCanReconcile(
          superAdmin || permissions.includes("commissions.reconcile"),
        );
        await load();
      } catch (caught) {
        if (!mounted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load referral commissions.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initialize();
    return () => {
      mounted = false;
    };
  }, [load]);

  function selectPlan(planId: string) {
    if (dirty) {
      setError(
        "Save or discard the current commission draft changes before switching versions.",
      );
      return;
    }
    const next = plans.find((plan) => plan.id === planId) ?? null;
    selectedPlanIdRef.current = planId;
    setSelectedPlanId(planId);
    setDraft(next ? draftSnapshot(next) : null);
    setError(null);
  }

  function updateLevel(index: number, patch: Partial<CommissionLevelRule>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        levels: current.levels.map((level, levelIndex) =>
          levelIndex === index ? { ...level, ...patch } : level,
        ),
      };
    });
  }

  async function saveDraft() {
    if (!selectedPlan || !draft || selectedPlan.status !== "DRAFT") return;
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/commission-plans/${encodeURIComponent(selectedPlan.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: selectedPlan.revision,
            reason: "Update reviewed COMM-01 referral commission draft.",
            ...draft,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(apiMessage(payload as ApiError, "Unable to save draft."));
      }
      const saved = payload as CommissionPlan;
      selectedPlanIdRef.current = saved.id;
      setSuccess(`Commission plan V${saved.versionNumber} draft updated.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save draft.");
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    if (!selectedPlan || selectedPlan.status !== "DRAFT") return;
    if (dirty) {
      setError(
        "Publication blocked: save all commission draft changes before publishing.",
      );
      return;
    }
    setBusy("publish");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/commission-plans/${encodeURIComponent(selectedPlan.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: selectedPlan.revision,
            reason: "Publish reviewed COMM-01 referral commission plan.",
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Unable to publish plan."),
        );
      }
      const published = payload as CommissionPlan;
      selectedPlanIdRef.current = published.id;
      setSuccess(`Commission plan V${published.versionNumber} published.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to publish plan.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cloneDraft(plan: CommissionPlan) {
    setBusy(`clone:${plan.id}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/commission-plans/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanVersionId: plan.id,
          reason: "Create next reviewed referral commission plan draft.",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(apiMessage(payload as ApiError, "Unable to clone draft."));
      }
      const created = payload as CommissionPlan;
      selectedPlanIdRef.current = created.id;
      setSuccess(`Commission plan V${created.versionNumber} draft created.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clone draft.");
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(subscriptionId: string) {
    setBusy(`reconcile:${subscriptionId}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}/process-commissions`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | ProcessResponse
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Unable to reconcile commission."),
        );
      }
      const result = payload as ProcessResponse;
      setSuccess(
        result.run.outcome === "PROCESSED"
          ? `Commission reconciliation complete: ${result.events.length} immutable event(s).`
          : `Commission reconciliation recorded: ${result.run.outcome}.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to reconcile commission.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>Loading referral commission workspace…</div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.flashStack}>
        {error ? <FlashMessage type="error" message={error} /> : null}
        {success ? <FlashMessage type="success" message={success} /> : null}
        {dirty ? (
          <div className={styles.unsavedBanner}>
            <strong>UNSAVED COMMISSION DRAFT CHANGES</strong>
            <span>Save before switching versions or publishing.</span>
          </div>
        ) : null}
      </div>

      <section className={styles.hero}>
        <div>
          <span>COMM-01 · LEDGER BACKED</span>
          <h2>Referral Commission Control</h2>
          <p>
            Versioned level rules, package matching and immutable commission
            outcomes sourced only from ACTIVE package subscriptions.
          </p>
        </div>
        <div className={styles.heroStats}>
          <article>
            <small>PLANS</small>
            <strong>{plans.length}</strong>
          </article>
          <article>
            <small>EVENTS</small>
            <strong>{events.length}</strong>
          </article>
          <article>
            <small>RECONCILIATION</small>
            <strong>{pending.length}</strong>
          </article>
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.versionRail}>
          <div className={styles.sectionTitle}>
            <span>VERSIONS</span>
            <h3>Commission plans</h3>
          </div>
          {plans.map((plan) => (
            <button
              type="button"
              key={plan.id}
              className={
                plan.id === selectedPlan?.id ? styles.versionActive : ""
              }
              onClick={() => selectPlan(plan.id)}
            >
              <strong>V{plan.versionNumber}</strong>
              <span>{plan.status}</span>
              <small>{dateLabel(plan.effectiveFrom)}</small>
            </button>
          ))}
        </aside>

        <div className={styles.editor}>
          {!selectedPlan || !draft ? (
            <div className={styles.empty}>No commission plan available.</div>
          ) : (
            <>
              <div className={styles.editorHead}>
                <div>
                  <span>PLAN V{selectedPlan.versionNumber}</span>
                  <h3>{selectedPlan.status}</h3>
                  <p>
                    {selectedPlan.status === "DRAFT"
                      ? "Draft has no financial effect until SUPER_ADMIN publication."
                      : `Effective ${dateLabel(selectedPlan.effectiveFrom)} → ${dateLabel(selectedPlan.effectiveTo)}`}
                  </p>
                </div>
                <div className={styles.actions}>
                  {selectedPlan.status === "PUBLISHED" && canManage ? (
                    <button
                      type="button"
                      onClick={() => void cloneDraft(selectedPlan)}
                      disabled={
                        Boolean(busy) ||
                        plans.some((plan) => plan.status === "DRAFT")
                      }
                    >
                      Clone draft
                    </button>
                  ) : null}
                  {selectedPlan.status === "DRAFT" && canManage ? (
                    <button
                      type="button"
                      onClick={() => void saveDraft()}
                      disabled={Boolean(busy) || !dirty}
                    >
                      {busy === "save"
                        ? "Saving…"
                        : dirty
                          ? "Save draft · UNSAVED"
                          : "Draft saved"}
                    </button>
                  ) : null}
                  {selectedPlan.status === "DRAFT" && isSuperAdmin ? (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void publishDraft()}
                      disabled={Boolean(busy) || dirty}
                    >
                      {dirty
                        ? "Save changes before publishing"
                        : busy === "publish"
                          ? "Publishing…"
                          : "Publish plan"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.policyGrid}>
                <label>
                  <span>First purchase</span>
                  <input
                    type="checkbox"
                    checked={draft.firstPurchaseEnabled}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        firstPurchaseEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>New purchase</span>
                  <input
                    type="checkbox"
                    checked={draft.newPurchaseEnabled}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        newPurchaseEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Active package required</span>
                  <input
                    type="checkbox"
                    checked={draft.activePackageRequired}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        activePackageRequired: event.target.checked,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Inactive upline</span>
                  <select
                    value={draft.inactiveUplineAction}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        inactiveUplineAction: event.target
                          .value as DraftState["inactiveUplineAction"],
                      })
                    }
                  >
                    <option value="LOST">Lost</option>
                    <option value="PENDING">Pending · engine deferred</option>
                    <option value="PASS_UP">Pass up · engine deferred</option>
                  </select>
                </label>
                <label>
                  <span>Compression</span>
                  <select
                    value={draft.compressionMode}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        compressionMode: event.target
                          .value as DraftState["compressionMode"],
                      })
                    }
                  >
                    <option value="SKIP">Skip</option>
                    <option value="PASS_SAME_LEVEL">
                      Pass same level · deferred
                    </option>
                    <option value="COMPRESS_LEVELS">
                      Compress levels · deferred
                    </option>
                    <option value="PENDING">Pending · deferred</option>
                  </select>
                </label>
                <label>
                  <span>Release</span>
                  <select
                    value={draft.releaseMode}
                    disabled={selectedPlan.status !== "DRAFT" || !canManage}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        releaseMode: event.target
                          .value as DraftState["releaseMode"],
                      })
                    }
                  >
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="HOLD_PERIOD">Hold period · deferred</option>
                    <option value="MANUAL_APPROVAL">
                      Manual approval · deferred
                    </option>
                    <option value="CONDITION_BASED">
                      Condition based · deferred
                    </option>
                  </select>
                </label>
              </div>

              <div className={styles.levelTable}>
                <div className={styles.sectionTitle}>
                  <span>PACKAGE MATCHING</span>
                  <h3>Level rules</h3>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Enabled</th>
                        <th>Rate %</th>
                        <th>Matching</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.levels.map((level, index) => (
                        <tr key={level.level}>
                          <td>L{level.level}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={level.enabled}
                              disabled={
                                selectedPlan.status !== "DRAFT" || !canManage
                              }
                              onChange={(event) =>
                                updateLevel(index, {
                                  enabled: event.target.checked,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={level.ratePercent}
                              disabled={
                                selectedPlan.status !== "DRAFT" || !canManage
                              }
                              onChange={(event) =>
                                updateLevel(index, {
                                  ratePercent: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={level.packageMatchingEnabled}
                              disabled={
                                selectedPlan.status !== "DRAFT" || !canManage
                              }
                              onChange={(event) =>
                                updateLevel(index, {
                                  packageMatchingEnabled: event.target.checked,
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span>RECOVERY</span>
            <h3>Commission reconciliation</h3>
          </div>
          <b>{pending.length} pending</b>
        </div>
        {pending.length === 0 ? (
          <div className={styles.empty}>No unprocessed package subscriptions.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>USER</th>
                  <th>Package</th>
                  <th>Activated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.subscriptionId}>
                    <td>
                      <strong>@{item.username}</strong>
                      <small>{item.email ?? "—"}</small>
                    </td>
                    <td>
                      {item.packageDisplayName}
                      <small>{amountLabel(item.price, item.currency)}</small>
                    </td>
                    <td>{dateLabel(item.activatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        disabled={!canReconcile || Boolean(busy)}
                        onClick={() => void reconcile(item.subscriptionId)}
                      >
                        {busy === `reconcile:${item.subscriptionId}`
                          ? "Processing…"
                          : "Process commission"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span>IMMUTABLE HISTORY</span>
            <h3>Referral commission events</h3>
          </div>
          <b>{events.length} loaded</b>
        </div>
        {events.length === 0 ? (
          <div className={styles.empty}>No referral commission events yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Receiver</th>
                  <th>Source</th>
                  <th>Level</th>
                  <th>Eligible base</th>
                  <th>Rate</th>
                  <th>Commission</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>
                        @{event.receiverUsername ?? event.receiverUserId}
                      </strong>
                      <small>{event.receiverEmail ?? "—"}</small>
                    </td>
                    <td>
                      {event.sourcePackageDisplayName ?? "Package"}
                      <small>
                        @{event.purchaserUsername ?? event.purchaserUserId}
                      </small>
                    </td>
                    <td>L{event.level}</td>
                    <td>{amountLabel(event.eligibleBase, event.currency)}</td>
                    <td>{event.ratePercent}%</td>
                    <td>{amountLabel(event.commissionAmount, event.currency)}</td>
                    <td>
                      <span
                        className={
                          event.status === "AVAILABLE"
                            ? styles.goodBadge
                            : styles.neutralBadge
                        }
                      >
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
