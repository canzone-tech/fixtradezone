"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { resolveAdminSession } from "@/lib/admin-session-client";
import { formatPlatformDateTime } from "@/lib/platform-time";
import type {
  ExistingSubscriptionRolloutMode,
  PackageRewardEvent,
  PackageRewardState,
  RewardPolicy,
  RewardReconciliationItem,
  RewardWorkerHealth,
} from "@/lib/rewards";
import styles from "./rewards.module.css";

interface ApiError {
  message?: string | string[];
}

interface PolicyListResponse {
  policies: RewardPolicy[];
}

interface RewardListResponse {
  rewards: PackageRewardEvent[];
}

interface StateListResponse {
  states: PackageRewardState[];
}

interface ReconciliationResponse {
  subscriptions: RewardReconciliationItem[];
}

interface ProcessDueResponse {
  initialized: number;
  processedSubscriptions: number;
  createdEvents: number;
  completedSubscriptions: number;
  blockedSubscriptions: number;
  remainingDue: number;
}

interface ProcessSubscriptionResponse {
  initialized: boolean;
  noEffectivePolicy: boolean;
  events: PackageRewardEvent[];
  state: PackageRewardState | null;
  message: string;
}

function apiMessage(payload: ApiError, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function dateLabel(value: string | null) {
  return formatPlatformDateTime(value);
}

function amountLabel(value: string, currency: string) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function enumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function policyDraft(policy: RewardPolicy) {
  return {
    existingSubscriptionRolloutMode: policy.existingSubscriptionRolloutMode,
    packageRewardCountsTowardCap: policy.packageRewardCountsTowardCap,
    referralCommissionCountsTowardCap: policy.referralCommissionCountsTowardCap,
    teamCommissionCountsTowardCap: policy.teamCommissionCountsTowardCap,
    awardRewardCountsTowardCap: policy.awardRewardCountsTowardCap,
    otherIncomeCountsTowardCap: policy.otherIncomeCountsTowardCap,
  };
}

type DraftState = ReturnType<typeof policyDraft>;

export default function RewardsClient() {
  const [policies, setPolicies] = useState<RewardPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const selectedPolicyIdRef = useRef("");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [states, setStates] = useState<PackageRewardState[]>([]);
  const [events, setEvents] = useState<PackageRewardEvent[]>([]);
  const [reconciliation, setReconciliation] = useState<
    RewardReconciliationItem[]
  >([]);
  const [workerHealth, setWorkerHealth] = useState<RewardWorkerHealth | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canReconcile, setCanReconcile] = useState(false);

  const selectedPolicy = useMemo(
    () =>
      policies.find((policy) => policy.id === selectedPolicyId) ??
      policies[0] ??
      null,
    [policies, selectedPolicyId],
  );

  const dirty = useMemo(() => {
    if (!selectedPolicy || !draft || selectedPolicy.status !== "DRAFT") {
      return false;
    }
    return JSON.stringify(draft) !== JSON.stringify(policyDraft(selectedPolicy));
  }, [draft, selectedPolicy]);

  const load = useCallback(async () => {
    const [policyRes, statesRes, eventsRes, queueRes, healthRes] =
      await Promise.all([
        fetch("/api/admin/reward-policies", { cache: "no-store" }),
        fetch("/api/admin/rewards/states?limit=100", { cache: "no-store" }),
        fetch("/api/admin/rewards?limit=100", { cache: "no-store" }),
        fetch("/api/admin/rewards/reconciliation?limit=100", {
          cache: "no-store",
        }),
        fetch("/api/admin/rewards/worker-health", { cache: "no-store" }),
      ]);

    const policyBody = (await policyRes.json().catch(() => ({}))) as
      | PolicyListResponse
      | ApiError;
    const statesBody = (await statesRes.json().catch(() => ({}))) as
      | StateListResponse
      | ApiError;
    const eventsBody = (await eventsRes.json().catch(() => ({}))) as
      | RewardListResponse
      | ApiError;
    const queueBody = (await queueRes.json().catch(() => ({}))) as
      | ReconciliationResponse
      | ApiError;
    const healthBody = (await healthRes.json().catch(() => ({}))) as
      | RewardWorkerHealth
      | ApiError;

    if (!policyRes.ok) {
      throw new Error(
        apiMessage(policyBody as ApiError, "Unable to load reward policy."),
      );
    }
    if (!statesRes.ok) {
      throw new Error(
        apiMessage(statesBody as ApiError, "Unable to load reward states."),
      );
    }
    if (!eventsRes.ok) {
      throw new Error(
        apiMessage(eventsBody as ApiError, "Unable to load reward events."),
      );
    }
    if (!queueRes.ok && queueRes.status !== 403) {
      throw new Error(
        apiMessage(queueBody as ApiError, "Unable to load reconciliation queue."),
      );
    }
    if (!healthRes.ok) {
      throw new Error(
        apiMessage(healthBody as ApiError, "Unable to load worker health."),
      );
    }

    const nextPolicies = (policyBody as PolicyListResponse).policies ?? [];
    const nextSelected =
      nextPolicies.find(
        (policy) => policy.id === selectedPolicyIdRef.current,
      ) ??
      nextPolicies[0] ??
      null;

    setPolicies(nextPolicies);
    setStates((statesBody as StateListResponse).states ?? []);
    setEvents((eventsBody as RewardListResponse).rewards ?? []);
    setReconciliation(
      queueRes.ok
        ? (queueBody as ReconciliationResponse).subscriptions ?? []
        : [],
    );
    setWorkerHealth(healthBody as RewardWorkerHealth);
    selectedPolicyIdRef.current = nextSelected?.id ?? "";
    setSelectedPolicyId(nextSelected?.id ?? "");
    setDraft(nextSelected ? policyDraft(nextSelected) : null);
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
        setCanReconcile(
          superAdmin || permissions.includes("rewards.reconcile"),
        );
        await load();
      } catch (caught) {
        if (!mounted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load reward workspace.",
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

  function selectPolicy(policyId: string) {
    if (dirty) {
      setError("Save or discard the current reward policy changes first.");
      return;
    }
    const next = policies.find((policy) => policy.id === policyId) ?? null;
    selectedPolicyIdRef.current = policyId;
    setSelectedPolicyId(policyId);
    setDraft(next ? policyDraft(next) : null);
    setError("");
  }

  async function saveDraft() {
    if (!selectedPolicy || !draft || selectedPolicy.status !== "DRAFT") return;
    setBusy("save");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/reward-policies/${encodeURIComponent(selectedPolicy.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: selectedPolicy.revision,
            reason: "Update reviewed RWD-01 reward/cap policy draft.",
            ...draft,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as
        | RewardPolicy
        | ApiError;
      if (!response.ok) {
        throw new Error(apiMessage(body as ApiError, "Unable to save policy."));
      }
      selectedPolicyIdRef.current = (body as RewardPolicy).id;
      setSuccess(`Reward policy V${(body as RewardPolicy).versionNumber} saved.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save policy.");
    } finally {
      setBusy(null);
    }
  }

  async function publishPolicy() {
    if (!selectedPolicy || selectedPolicy.status !== "DRAFT") return;
    if (dirty) {
      setError("Publication blocked: save reward policy changes first.");
      return;
    }
    setBusy("publish");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/reward-policies/${encodeURIComponent(selectedPolicy.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: selectedPolicy.revision,
            reason: "Publish Founder-approved RWD-01 forward-only policy.",
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as
        | RewardPolicy
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(body as ApiError, "Unable to publish reward policy."),
        );
      }
      selectedPolicyIdRef.current = (body as RewardPolicy).id;
      setSuccess(`Reward policy V${(body as RewardPolicy).versionNumber} published.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish reward policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cloneDraft(policy: RewardPolicy) {
    setBusy(`clone:${policy.id}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/reward-policies/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePolicyVersionId: policy.id,
          reason: "Create next versioned reward/cap policy draft.",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | RewardPolicy
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(body as ApiError, "Unable to create reward policy draft."),
        );
      }
      selectedPolicyIdRef.current = (body as RewardPolicy).id;
      setSuccess(`Reward policy V${(body as RewardPolicy).versionNumber} draft created.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create reward policy draft.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function processDue() {
    setBusy("process-due");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/rewards/process-due", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as
        | ProcessDueResponse
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(body as ApiError, "Unable to process due rewards."),
        );
      }
      const result = body as ProcessDueResponse;
      setSuccess(
        `Due reward run: ${result.initialized} initialized, ${result.createdEvents} event(s) posted, ${result.remainingDue} remaining due.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to process due rewards.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(subscriptionId: string) {
    setBusy(`reconcile:${subscriptionId}`);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}/process-rewards`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as
        | ProcessSubscriptionResponse
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(body as ApiError, "Unable to reconcile package rewards."),
        );
      }
      const result = body as ProcessSubscriptionResponse;
      setSuccess(result.message);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to reconcile package rewards.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading reward control plane…</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.flashStack}>
        {error ? (
          <FlashMessage
            type="error"
            message={error}
            onClose={() => setError("")}
          />
        ) : null}
        {success ? (
          <FlashMessage
            type="success"
            message={success}
            onClose={() => setSuccess("")}
          />
        ) : null}
        {dirty ? (
          <div className={styles.unsavedBanner}>
            <strong>UNSAVED REWARD POLICY CHANGES</strong>
            <span>Save before switching versions or publishing.</span>
          </div>
        ) : null}
      </div>

      <section className={styles.hero}>
        <div>
          <span>RWD-01 · IMMUTABLE DAILY SETTLEMENT</span>
          <h2>Rewards, Caps & Lifecycle</h2>
          <p>
            Daily package rewards are sourced only from ACTIVE subscription
            snapshots and settle through balanced Package Earnings ledger entries.
          </p>
        </div>
        <div className={styles.heroStats}>
          <article><small>STATES</small><strong>{states.length}</strong></article>
          <article><small>EVENTS</small><strong>{events.length}</strong></article>
          <article><small>QUEUE</small><strong>{reconciliation.length}</strong></article>
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.versionRail}>
          <div className={styles.sectionTitle}>
            <span>VERSIONED POLICY</span>
            <h3>Reward cap policy</h3>
          </div>
          {policies.map((policy) => (
            <button
              type="button"
              key={policy.id}
              className={policy.id === selectedPolicy?.id ? styles.versionActive : ""}
              onClick={() => selectPolicy(policy.id)}
            >
              <strong>V{policy.versionNumber}</strong>
              <span>{policy.status}</span>
              <small>{dateLabel(policy.effectiveFrom)}</small>
            </button>
          ))}
        </aside>

        <div className={styles.editor}>
          {!selectedPolicy || !draft ? (
            <div className={styles.empty}>No reward/cap policy available.</div>
          ) : (
            <>
              <div className={styles.editorHead}>
                <div>
                  <span>POLICY V{selectedPolicy.versionNumber}</span>
                  <h3>{selectedPolicy.status}</h3>
                  <p>
                    {selectedPolicy.status === "DRAFT"
                      ? "Draft has zero financial effect until SUPER_ADMIN publication."
                      : `Effective ${dateLabel(selectedPolicy.effectiveFrom)} → ${dateLabel(selectedPolicy.effectiveTo)}`}
                  </p>
                </div>
                <div className={styles.actions}>
                  {selectedPolicy.status === "PUBLISHED" && isSuperAdmin ? (
                    <button
                      type="button"
                      disabled={Boolean(busy) || policies.some((item) => item.status === "DRAFT")}
                      onClick={() => void cloneDraft(selectedPolicy)}
                    >
                      Clone draft
                    </button>
                  ) : null}
                  {selectedPolicy.status === "DRAFT" && isSuperAdmin ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busy) || !dirty}
                        onClick={() => void saveDraft()}
                      >
                        {busy === "save" ? "Saving…" : dirty ? "Save policy · UNSAVED" : "Policy saved"}
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={Boolean(busy) || dirty}
                        onClick={() => void publishPolicy()}
                      >
                        {dirty ? "Save changes before publishing" : busy === "publish" ? "Publishing…" : "Publish policy"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className={styles.policyGrid}>
                <label>
                  <span>Existing subscriptions</span>
                  <select
                    value={draft.existingSubscriptionRolloutMode}
                    disabled={selectedPolicy.status !== "DRAFT" || !isSuperAdmin}
                    onChange={(event) => setDraft({ ...draft, existingSubscriptionRolloutMode: event.target.value as ExistingSubscriptionRolloutMode })}
                  >
                    <option value="FORWARD_ONLY_FROM_POLICY_EFFECTIVE">Forward only from policy effective</option>
                    <option value="RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE">Retroactive · engine deferred</option>
                  </select>
                </label>
                {[
                  ["Package reward", "packageRewardCountsTowardCap"],
                  ["Referral commission", "referralCommissionCountsTowardCap"],
                  ["Team commission", "teamCommissionCountsTowardCap"],
                  ["Award reward", "awardRewardCountsTowardCap"],
                  ["Other income", "otherIncomeCountsTowardCap"],
                ].map(([label, key]) => (
                  <label key={key}>
                    <span>{label} counts toward cap</span>
                    <input
                      type="checkbox"
                      checked={Boolean(draft[key as keyof DraftState])}
                      disabled={selectedPolicy.status !== "DRAFT" || !isSuperAdmin}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
                    />
                  </label>
                ))}
              </div>

              <div className={styles.safeRule}>
                <i className="iconoir-shield-check" />
                Initial executable policy is Forward Only + Package Reward counts
                toward cap. Retroactive catch-up and other cap-contribution mixes
                fail closed until their dedicated engines are accepted.
              </div>
            </>
          )}
        </div>
      </section>

      <section className={styles.healthGrid}>
        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div><span>AUTOMATIC WORKER</span><h3>Scheduler health</h3></div>
            <b>{workerHealth?.lastError ? "ATTENTION" : "READY"}</b>
          </div>
          <dl className={styles.healthList}>
            <div><dt>Last started</dt><dd>{dateLabel(workerHealth?.lastStartedAt ?? null)}</dd></div>
            <div><dt>Last completed</dt><dd>{dateLabel(workerHealth?.lastCompletedAt ?? null)}</dd></div>
            <div><dt>Last events</dt><dd>{workerHealth?.lastSummary?.createdEvents ?? 0}</dd></div>
            <div><dt>Remaining due</dt><dd>{workerHealth?.lastSummary?.remainingDue ?? 0}</dd></div>
          </dl>
          {workerHealth?.lastError ? <p className={styles.workerError}>{workerHealth.lastError}</p> : null}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div><span>AUTHORIZED RECOVERY</span><h3>Process due rewards</h3></div>
          </div>
          <p className={styles.cardCopy}>
            Uses the exact same idempotent calculation service as the automatic
            worker. No reward amount can be entered manually.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canReconcile || Boolean(busy)}
            onClick={() => void processDue()}
          >
            {busy === "process-due" ? "Processing…" : "Process due rewards"}
          </button>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div><span>RECONCILIATION</span><h3>Due / blocked subscriptions</h3></div>
          <b>{reconciliation.length} loaded</b>
        </div>
        {reconciliation.length === 0 ? (
          <div className={styles.empty}>No due or blocked reward subscriptions.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>USER</th><th>Package</th><th>State</th><th>Next due</th><th>Action</th></tr></thead>
              <tbody>
                {reconciliation.map((item) => (
                  <tr key={item.subscriptionId}>
                    <td><strong>@{item.username}</strong><small>{item.email ?? "—"}</small></td>
                    <td>{item.packageDisplayName}<small>{amountLabel(item.packageValue, item.currency)}</small></td>
                    <td><span className={item.stateStatus === "BLOCKED" ? styles.badBadge : styles.neutralBadge}>{enumLabel(item.stateStatus)}</span>{item.blockedReason ? <small>{item.blockedReason}</small> : null}</td>
                    <td>{dateLabel(item.nextRewardAt)}</td>
                    <td><button type="button" disabled={!canReconcile || Boolean(busy)} onClick={() => void reconcile(item.subscriptionId)}>{busy === `reconcile:${item.subscriptionId}` ? "Processing…" : "Reconcile"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div><span>CAP + LIFECYCLE</span><h3>Package reward states</h3></div>
          <b>{states.length} loaded</b>
        </div>
        {states.length === 0 ? (
          <div className={styles.empty}>No reward lifecycle states yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>USER</th><th>Package</th><th>Cap</th><th>Progress</th><th>Next reward</th><th>Status</th></tr></thead>
              <tbody>
                {states.map((state) => (
                  <tr key={state.subscriptionId}>
                    <td><strong>@{state.username ?? state.userId}</strong><small>{state.email ?? "—"}</small></td>
                    <td>{state.packageDisplayName ?? "Package"}<small>{amountLabel(state.packageValue, state.currency)}</small></td>
                    <td>{amountLabel(state.capConsumed, state.currency)} / {amountLabel(state.capLimit, state.currency)}</td>
                    <td>Day {state.nextRewardDayNumber} · Cycle {state.nextCycleNumber}/{state.nextCycleDay}<small>{state.settledRewardCount} settled</small></td>
                    <td>{dateLabel(state.nextRewardAt)}</td>
                    <td><span className={state.status === "ACTIVE" ? styles.goodBadge : state.status === "BLOCKED" ? styles.badBadge : styles.neutralBadge}>{state.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div><span>IMMUTABLE LEDGER HISTORY</span><h3>Package reward events</h3></div>
          <b>{events.length} loaded</b>
        </div>
        {events.length === 0 ? (
          <div className={styles.empty}>No package reward events have settled yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>USER</th><th>Package / date</th><th>Rate</th><th>Calculated</th><th>Posted</th><th>Cap after</th><th>Lifecycle</th></tr></thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td><strong>@{event.username ?? event.userId}</strong><small>{event.email ?? "—"}</small></td>
                    <td>{event.packageDisplayName}<small>{event.rewardLocalDate} · day {event.rewardDayNumber}</small></td>
                    <td>{event.selectedRate}%<small>{enumLabel(event.rewardRateMode)}</small></td>
                    <td>{amountLabel(event.calculatedReward, event.currency)}</td>
                    <td>{amountLabel(event.postedReward, event.currency)}{event.clippedToCap ? <small>Clipped to cap</small> : null}</td>
                    <td>{amountLabel(event.capConsumedAfter, event.currency)} / {amountLabel(event.capLimit, event.currency)}</td>
                    <td>{event.completionReason ? enumLabel(event.completionReason) : `Cycle ${event.cycleNumber} / day ${event.cycleDay}`}</td>
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
