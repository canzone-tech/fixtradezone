"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./simulated-trades.module.css";

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
  minimumGapMinutes: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: TimingWindow[];
  timezoneSnapshot: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  disclosure: string;
  financialEffect: "NONE";
}

interface PoliciesPayload {
  policies: Policy[];
  message?: string | string[];
}

interface EventRow {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  policyVersionId: string;
  packageCode: string;
  packageDisplayName: string;
  localActivityDate: string;
  slotNumber: number;
  scheduledAt: string;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: "WIN" | "LOSS";
  resultPercent: string;
  generationSource: "WORKER" | "RECONCILIATION";
  generatedAt: string;
  username?: string;
  email?: string | null;
}

interface EventsPayload {
  disclosure: string;
  events: EventRow[];
  total: number;
  page: number;
  limit: number;
  message?: string | string[];
}

interface ReconciliationPayload {
  disclosure: string;
  noEffectivePolicy: boolean;
  policyEnabled: boolean;
  policyVersionId?: string;
  policyVersionNumber?: number;
  localActivityDate: string | null;
  timezoneSnapshot?: string;
  activitiesPerDay?: number;
  minimumGapMinutes?: number;
  eligibleSubscriptions: number;
  eventsToday: number;
  configuredMaximumSlotsToday: number;
  message?: string | string[];
}

interface WorkerHealth {
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  infrastructureEnabled: boolean;
  operationsMode: "AUTOMATIC" | "CONTROLLED_MANUAL";
  platformTimezone: string;
  automaticProcessingEnabled: boolean;
  intervalMs: number;
  message?: string | string[];
}

interface BatchPayload {
  createdEvents: number;
  alreadyPresent: number;
  skippedNotDue: number;
  processedSubscriptions: number;
  remainingSubscriptions: number;
  message?: string | string[];
}

interface FormState {
  enabled: boolean;
  activitiesPerDay: string;
  minimumGapMinutes: string;
  assetSymbols: string;
  winWeight: string;
  lossWeight: string;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: string;
  reason: string;
}

const EMPTY_FORM: FormState = {
  enabled: true,
  activitiesPerDay: "5",
  minimumGapMinutes: "240",
  assetSymbols: "BTCUSDT, ETHUSDT, SOLUSDT",
  winWeight: "3",
  lossWeight: "2",
  winMinimumPercent: "0.500000",
  winMaximumPercent: "2.500000",
  lossMinimumPercent: "0.250000",
  lossMaximumPercent: "1.500000",
  timingWindows: "00:00-23:59",
  reason: "",
};

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
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

function formFor(policy: Policy): FormState {
  return {
    enabled: policy.enabled,
    activitiesPerDay: String(policy.activitiesPerDay),
    minimumGapMinutes: String(policy.minimumGapMinutes),
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
    reason: "",
  };
}

function parseAssets(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean);
}

function parseWindows(value: string): TimingWindow[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(line);
      if (!match) {
        throw new Error("Timing windows must use HH:MM-HH:MM, one per line.");
      }
      return { start: match[1], end: match[2] };
    });
}

function hasPermission(user: AdminUser, permission: string): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") || user.permissions.includes(permission)
  );
}

export default function SimulatedTradesClient() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [reconciliation, setReconciliation] =
    useState<ReconciliationPayload | null>(null);
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSuperAdmin = currentUser?.roles.includes("SUPER_ADMIN") ?? false;
  const can = useCallback(
    (permission: string) =>
      isSuperAdmin || currentUser?.permissions.includes(permission) === true,
    [currentUser, isSuperAdmin],
  );

  const draft = useMemo(
    () => policies.find((policy) => policy.status === "DRAFT") ?? null,
    [policies],
  );
  const latestPublished = useMemo(
    () => policies.find((policy) => policy.status === "PUBLISHED") ?? null,
    [policies],
  );
  const effectivePolicy = useMemo(() => {
    if (!reconciliation?.policyVersionId) return null;
    return (
      policies.find((policy) => policy.id === reconciliation.policyVersionId) ??
      null
    );
  }, [policies, reconciliation]);

  const loadWorkspace = useCallback(async () => {
    try {
      setError("");
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const sessionPayload = await readPayload<{
        user?: AdminUser;
        message?: string;
      }>(sessionResponse);
      if (sessionResponse.status === 401 || sessionResponse.status === 403) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!sessionResponse.ok || !sessionPayload?.user) {
        throw new Error(
          messageFrom(sessionPayload, "Unable to load administrator session."),
        );
      }
      const user = sessionPayload.user;
      setCurrentUser(user);

      const canRead = hasPermission(user, "simulated_activity.read");
      const canReconcile = hasPermission(user, "simulated_activity.reconcile");
      if (!canRead) {
        throw new Error("You do not have Trade Activity read permission.");
      }

      const [policiesResponse, eventsResponse, workerResponse] =
        await Promise.all([
          fetch("/api/admin/simulated-activity/policies", {
            cache: "no-store",
          }),
          fetch("/api/admin/simulated-activity/events?limit=50", {
            cache: "no-store",
          }),
          fetch("/api/admin/simulated-activity/worker-health", {
            cache: "no-store",
          }),
        ]);

      if (
        [policiesResponse, eventsResponse, workerResponse].some(
          (response) => response.status === 401,
        )
      ) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const policiesPayload =
        await readPayload<PoliciesPayload>(policiesResponse);
      const eventsPayload = await readPayload<EventsPayload>(eventsResponse);
      const workerPayload = await readPayload<WorkerHealth>(workerResponse);

      if (!policiesResponse.ok || !policiesPayload?.policies) {
        throw new Error(
          messageFrom(policiesPayload, "Unable to load Trade Activity policies."),
        );
      }
      if (!eventsResponse.ok || !eventsPayload?.events) {
        throw new Error(
          messageFrom(eventsPayload, "Unable to load generated trade events."),
        );
      }
      if (!workerResponse.ok || !workerPayload) {
        throw new Error(
          messageFrom(workerPayload, "Unable to load Trade Activity worker health."),
        );
      }

      let reconciliationPayload: ReconciliationPayload | null = null;
      if (canReconcile) {
        const reconciliationResponse = await fetch(
          "/api/admin/simulated-activity/reconciliation",
          { cache: "no-store" },
        );
        if (reconciliationResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }
        reconciliationPayload = await readPayload<ReconciliationPayload>(
          reconciliationResponse,
        );
        if (!reconciliationResponse.ok || !reconciliationPayload) {
          throw new Error(
            messageFrom(
              reconciliationPayload,
              "Unable to load Trade Activity reconciliation.",
            ),
          );
        }
      }

      setPolicies(policiesPayload.policies);
      setEvents(eventsPayload.events);
      setReconciliation(reconciliationPayload);
      setWorker(workerPayload);

      const editable = policiesPayload.policies.find(
        (policy) => policy.status === "DRAFT",
      );
      if (editable) setForm(formFor(editable));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Trade Activity workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (!draft || !isSuperAdmin || saving) return;
    if (form.reason.trim().length < 3) {
      setError("Enter an audited reason of at least 3 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const timingWindows = parseWindows(form.timingWindows);
      const response = await fetch(
        `/api/admin/simulated-activity/policies/${encodeURIComponent(draft.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draft.revision,
            reason: form.reason.trim(),
            enabled: form.enabled,
            activitiesPerDay: Number(form.activitiesPerDay),
            minimumGapMinutes: Number(form.minimumGapMinutes),
            assetSymbols: parseAssets(form.assetSymbols),
            winWeight: Number(form.winWeight),
            lossWeight: Number(form.lossWeight),
            winMinimumPercent: form.winMinimumPercent.trim(),
            winMaximumPercent: form.winMaximumPercent.trim(),
            lossMinimumPercent: form.lossMinimumPercent.trim(),
            lossMaximumPercent: form.lossMaximumPercent.trim(),
            timingWindows,
          }),
        },
      );
      const payload = await readPayload<
        Policy & { message?: string | string[] }
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Unable to save Trade Activity policy."),
        );
      }
      setNotice(
        `Draft V${payload.versionNumber} saved at revision ${payload.revision}.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save policy draft.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!draft || !isSuperAdmin || saving) return;
    if (form.reason.trim().length < 3) {
      setError("Enter an audited publication reason of at least 3 characters.");
      return;
    }
    if (
      !window.confirm(
        `Publish Trade Activity policy V${draft.versionNumber}? It will become effective at the next Platform Operations local calendar-day boundary.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/simulated-activity/policies/${encodeURIComponent(draft.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draft.revision,
            reason: form.reason.trim(),
          }),
        },
      );
      const payload = await readPayload<
        Policy & { message?: string | string[] }
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Unable to publish Trade Activity policy."),
        );
      }
      setNotice(
        `Policy V${payload.versionNumber} published for its next local-day boundary. Historical trade events remain immutable.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to publish policy.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function clonePublished() {
    if (!latestPublished || !isSuperAdmin || saving) return;
    const reason = window.prompt(
      "Audited reason for creating a new policy draft:",
      "Policy update",
    );
    if (!reason || reason.trim().length < 3) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/admin/simulated-activity/policies/drafts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourcePolicyVersionId: latestPublished.id,
            reason: reason.trim(),
          }),
        },
      );
      const payload = await readPayload<
        Policy & { message?: string | string[] }
      >(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Unable to create Trade Activity policy draft."),
        );
      }
      setNotice(
        `Draft V${payload.versionNumber} created from V${latestPublished.versionNumber}.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create draft.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function processDue() {
    if (!can("simulated_activity.reconcile") || processing) return;
    setProcessing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/admin/simulated-activity/process-due",
        { method: "POST" },
      );
      const payload = await readPayload<BatchPayload>(response);
      if (!response.ok || !payload) {
        throw new Error(
          messageFrom(payload, "Unable to reconcile Trade Activity."),
        );
      }
      setNotice(
        `Reconciliation created ${payload.createdEvents} event(s); ${payload.alreadyPresent} already existed; ${payload.skippedNotDue} slot(s) are not due; ${payload.remainingSubscriptions} subscription(s) remain outside this batch.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to process trade slots.",
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading Trade Activity…</p>
      </div>
    );
  }

  const presentedPolicy = draft ?? latestPublished;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>TRADE ACTIVITY / POLICY CONTROL</p>
          <h2>Trade Activity</h2>
          <p>
            Versioned deterministic trade rows are generated independently for
            every eligible ACTIVE package subscription. This workspace does not
            represent external broker or exchange execution and has no direct
            wallet or ledger mutation path.
          </p>
        </div>
        <span className={styles.disclosurePill}>SYSTEM-GENERATED</span>
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
        <article className={styles.stat}>
          <small>Effective policy</small>
          <strong>
            {effectivePolicy ? `V${effectivePolicy.versionNumber}` : "None"}
          </strong>
        </article>
        <article className={styles.stat}>
          <small>Eligible subscriptions</small>
          <strong>
            {reconciliation ? reconciliation.eligibleSubscriptions : "—"}
          </strong>
        </article>
        <article className={styles.stat}>
          <small>Trades today</small>
          <strong>{reconciliation ? reconciliation.eventsToday : "—"}</strong>
        </article>
        <article className={styles.stat}>
          <small>Automatic generator</small>
          <strong>{worker?.automaticProcessingEnabled ? "ON" : "OFF"}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>VERSIONED POLICY</p>
              <h3>
                {draft
                  ? `Draft V${draft.versionNumber}`
                  : latestPublished
                    ? `Latest Published V${latestPublished.versionNumber}`
                    : "No policy"}
              </h3>
            </div>
            <span
              className={styles.badge}
              data-tone={
                draft ? "warning" : latestPublished ? "success" : "muted"
              }
            >
              {draft ? "DRAFT" : latestPublished ? "PUBLISHED" : "UNAVAILABLE"}
            </span>
          </div>

          {draft ? (
            <div className={styles.formGrid}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    updateForm("enabled", event.target.checked)
                  }
                  disabled={!isSuperAdmin || saving}
                />
                Trade generation enabled
              </label>
              <div className={styles.field}>
                <label htmlFor="activitiesPerDay">
                  Trades / day / ACTIVE subscription
                </label>
                <input
                  id="activitiesPerDay"
                  type="number"
                  min="1"
                  max="50"
                  value={form.activitiesPerDay}
                  onChange={(event) =>
                    updateForm("activitiesPerDay", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="minimumGapMinutes">Minimum gap (minutes)</label>
                <input
                  id="minimumGapMinutes"
                  type="number"
                  min="0"
                  max="1439"
                  value={form.minimumGapMinutes}
                  onChange={(event) =>
                    updateForm("minimumGapMinutes", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.fieldWide}>
                <label htmlFor="assetSymbols">
                  Assets (comma or line separated)
                </label>
                <textarea
                  id="assetSymbols"
                  value={form.assetSymbols}
                  onChange={(event) =>
                    updateForm("assetSymbols", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="winWeight">WIN weight</label>
                <input
                  id="winWeight"
                  type="number"
                  min="0"
                  value={form.winWeight}
                  onChange={(event) =>
                    updateForm("winWeight", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="lossWeight">LOSS weight</label>
                <input
                  id="lossWeight"
                  type="number"
                  min="0"
                  value={form.lossWeight}
                  onChange={(event) =>
                    updateForm("lossWeight", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="winMin">WIN min %</label>
                <input
                  id="winMin"
                  value={form.winMinimumPercent}
                  onChange={(event) =>
                    updateForm("winMinimumPercent", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="winMax">WIN max %</label>
                <input
                  id="winMax"
                  value={form.winMaximumPercent}
                  onChange={(event) =>
                    updateForm("winMaximumPercent", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="lossMin">LOSS magnitude min %</label>
                <input
                  id="lossMin"
                  value={form.lossMinimumPercent}
                  onChange={(event) =>
                    updateForm("lossMinimumPercent", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="lossMax">LOSS magnitude max %</label>
                <input
                  id="lossMax"
                  value={form.lossMaximumPercent}
                  onChange={(event) =>
                    updateForm("lossMaximumPercent", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
              </div>
              <div className={styles.fieldWide}>
                <label htmlFor="timingWindows">
                  Timing windows — one HH:MM-HH:MM per line
                </label>
                <textarea
                  id="timingWindows"
                  value={form.timingWindows}
                  onChange={(event) =>
                    updateForm("timingWindows", event.target.value)
                  }
                  disabled={!isSuperAdmin || saving}
                />
                <small className={styles.muted}>
                  Five trades with a 240-minute minimum gap require at least a
                  16-hour span between the first and last scheduled trade.
                </small>
              </div>
              <div className={styles.fieldWide}>
                <label htmlFor="reason">Audited reason</label>
                <input
                  id="reason"
                  value={form.reason}
                  onChange={(event) => updateForm("reason", event.target.value)}
                  disabled={!isSuperAdmin || saving}
                  placeholder="Why are these Trade Activity settings changing?"
                />
              </div>
              <div className={`${styles.actions} ${styles.fieldWide}`}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={!isSuperAdmin || saving}
                >
                  Save Draft
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => void publishDraft()}
                  disabled={!isSuperAdmin || saving}
                >
                  Publish Next Local Day
                </button>
              </div>
            </div>
          ) : latestPublished ? (
            <>
              <dl className={styles.detailList}>
                <div>
                  <dt>Status</dt>
                  <dd>{latestPublished.enabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Trades/day/subscription</dt>
                  <dd>{latestPublished.activitiesPerDay}</dd>
                </div>
                <div>
                  <dt>Minimum trade gap</dt>
                  <dd>
                    {latestPublished.minimumGapMinutes > 0
                      ? `${latestPublished.minimumGapMinutes} minutes`
                      : "Legacy schedule"}
                  </dd>
                </div>
                <div>
                  <dt>Assets</dt>
                  <dd>{latestPublished.assetSymbols.join(", ")}</dd>
                </div>
                <div>
                  <dt>WIN / LOSS weight</dt>
                  <dd>
                    {latestPublished.winWeight} / {latestPublished.lossWeight}
                  </dd>
                </div>
                <div>
                  <dt>WIN range</dt>
                  <dd>
                    {latestPublished.winMinimumPercent}% –{" "}
                    {latestPublished.winMaximumPercent}%
                  </dd>
                </div>
                <div>
                  <dt>LOSS magnitude range</dt>
                  <dd>
                    {latestPublished.lossMinimumPercent}% –{" "}
                    {latestPublished.lossMaximumPercent}%
                  </dd>
                </div>
                <div>
                  <dt>Policy timezone</dt>
                  <dd>{latestPublished.timezoneSnapshot ?? "—"}</dd>
                </div>
                <div>
                  <dt>Effective boundary</dt>
                  <dd>
                    {formatPlatformDateTime(
                      latestPublished.effectiveFrom,
                      latestPublished.timezoneSnapshot ?? undefined,
                    )}
                  </dd>
                </div>
              </dl>
              {isSuperAdmin ? (
                <div className={styles.actions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => void clonePublished()}
                    disabled={saving}
                  >
                    Clone New Draft
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>No Trade Activity policy is available.</div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>GENERATOR / RECOVERY</p>
              <h3>Runtime status</h3>
            </div>
            <span
              className={styles.badge}
              data-tone={
                worker?.automaticProcessingEnabled ? "success" : "warning"
              }
            >
              {worker?.automaticProcessingEnabled ? "AUTOMATIC" : "CONTROLLED"}
            </span>
          </div>
          <dl className={styles.detailList}>
            <div>
              <dt>Infrastructure worker</dt>
              <dd>{worker?.infrastructureEnabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Operations mode</dt>
              <dd>{worker?.operationsMode ?? "—"}</dd>
            </div>
            <div>
              <dt>Platform timezone</dt>
              <dd>{worker?.platformTimezone ?? "—"}</dd>
            </div>
            <div>
              <dt>Effective policy timezone</dt>
              <dd>{effectivePolicy?.timezoneSnapshot ?? "—"}</dd>
            </div>
            <div>
              <dt>Local activity date</dt>
              <dd>{reconciliation?.localActivityDate ?? "—"}</dd>
            </div>
            <div>
              <dt>Configured trades today</dt>
              <dd>{reconciliation?.configuredMaximumSlotsToday ?? "—"}</dd>
            </div>
            <div>
              <dt>Minimum trade gap</dt>
              <dd>
                {reconciliation?.minimumGapMinutes !== undefined
                  ? `${reconciliation.minimumGapMinutes} minutes`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Last worker run</dt>
              <dd>{formatPlatformDateTime(worker?.lastCompletedAt ?? null)}</dd>
            </div>
            <div>
              <dt>Last error</dt>
              <dd>{worker?.lastError ?? "None"}</dd>
            </div>
          </dl>
          {can("simulated_activity.reconcile") ? (
            <div className={styles.actions}>
              <button
                className={styles.buttonDanger}
                type="button"
                onClick={() => void processDue()}
                disabled={processing}
              >
                {processing ? "Processing…" : "Process Due Trade Slots"}
              </button>
            </div>
          ) : null}
          <p className={styles.muted}>
            Recovery uses the same deterministic generator. Administrators
            cannot enter an arbitrary WIN/LOSS or result percentage. Prior local
            dates are not synthetically backfilled.
          </p>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>IMMUTABLE HISTORY</p>
            <h3>Generated trade events</h3>
          </div>
          <span className={styles.badge} data-tone="muted">
            {events.length} loaded
          </span>
        </div>
        {events.length === 0 ? (
          <div className={styles.empty}>
            No due Trade Activity has been generated yet.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Package</th>
                  <th>Trade time</th>
                  <th>Asset</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>Source</th>
                  <th>Trade #</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.username ?? event.userId}</td>
                    <td>{event.packageDisplayName}</td>
                    <td>
                      {formatPlatformDateTime(
                        event.scheduledAt,
                        event.timezoneSnapshot,
                      )}
                      <br />
                      <span className={styles.muted}>
                        {event.timezoneSnapshot}
                      </span>
                    </td>
                    <td className={styles.mono}>{event.assetSymbol}</td>
                    <td
                      className={
                        event.outcome === "WIN" ? styles.win : styles.loss
                      }
                    >
                      {event.outcome}
                    </td>
                    <td
                      className={
                        event.outcome === "WIN" ? styles.win : styles.loss
                      }
                    >
                      {Number(event.resultPercent) > 0 ? "+" : ""}
                      {event.resultPercent}%
                    </td>
                    <td>{event.generationSource}</td>
                    <td>
                      {event.localActivityDate} / {event.slotNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.disclosure}>
        <i className="iconoir-warning-triangle" />
        <div>
          <strong>SYSTEM-GENERATED TRADE ACTIVITY</strong>
          <p>
            {presentedPolicy?.disclosure ??
              "Trade activity does not represent external market execution."}
          </p>
          <p>
            This module has no direct wallet, ledger, reward, cap or commission
            mutation path and does not expose arbitrary manual trade outcomes.
          </p>
        </div>
      </section>

      {presentedPolicy?.financialEffect !== "NONE" ? (
        <div className={styles.alert} data-tone="error">
          Trade Activity financial isolation is inconsistent. Generation is
          blocked until configuration is repaired.
        </div>
      ) : null}
    </div>
  );
}
