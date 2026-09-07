"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { usePlatformTime } from "@/components/platform/platform-time-provider";
import type { AdminUser } from "@/lib/auth";
import { resolveAdminSession } from "@/lib/admin-session-client";
import {
  ACTIVE_PACKAGE_MODES,
  apiMessage,
  decimalLabel,
  enumLabel,
  investmentRangeLabel,
  MULTIPLE_ACTIVE_PACKAGE_BASES,
  PACKAGE_ACTIVATION_TRIGGERS,
  PACKAGE_PLAN_MIGRATION_MODES,
  PACKAGE_RENEWAL_MODES,
  readApiPayload,
  rewardRateLabel,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanItem,
  type PackagePlanSummary,
} from "@/lib/packages";
import {
  formatPlatformDateTime,
  platformLocalDateTimeToIso,
} from "@/lib/platform-time";
import styles from "./packages.module.css";

interface PlanListPayload extends ApiErrorPayload {
  planVersions?: PackagePlanSummary[];
}

interface PlanPayload extends ApiErrorPayload {
  plan?: PackagePlan;
}

interface MutationPayload extends ApiErrorPayload {
  message?: string;
  plan?: PackagePlan;
}

interface PlanSettingsForm {
  activePackageMode: string;
  multipleActivePackageBasis: string;
  activationTrigger: string;
  migrationMode: string;
  renewalMode: string;
  upgradesEnabled: boolean;
}

interface FieldProps {
  label: string;
  help?: string;
  children: ReactNode;
}

function Field({ label, help, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {enumLabel(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function settingsFromPlan(plan: PackagePlan): PlanSettingsForm {
  return {
    activePackageMode: plan.activePackageMode,
    multipleActivePackageBasis: plan.multipleActivePackageBasis,
    activationTrigger: plan.activationTrigger,
    migrationMode: plan.migrationMode,
    renewalMode: plan.renewalMode,
    upgradesEnabled: plan.upgradesEnabled,
  };
}

function formatDate(value: string | null): string {
  return value ? formatPlatformDateTime(value) : "Not set";
}

function canReadPackages(user: AdminUser): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") ||
    user.permissions.includes("packages.read")
  );
}

function canManagePackages(user: AdminUser): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") ||
    user.permissions.includes("packages.draft.manage")
  );
}

function capitalReturnSummary(item: PackagePlanItem): string {
  return item.principalReturn === "RETURN_EXACT_INVESTED_PRINCIPAL"
    ? "Capital return: Yes"
    : item.principalReturn === "NO_CAPITAL_RETURN"
      ? "Capital return: No"
      : "Capital return: Legacy terms";
}

function maximumSummary(item: PackagePlanItem): string {
  if (item.maximumInvestment === null) {
    return "Unlimited investment · no finite maximum return";
  }

  if (item.maximumTotalReturn === null) {
    return "No finite maximum return";
  }

  return `${decimalLabel(item.maximumTotalReturn)} ${item.currency} max total`;
}

function isoToPlatformInput(value: string | null, timeZone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");

  return year && month && day && hour && minute
    ? `${year}-${month}-${day}T${hour}:${minute}`
    : "";
}

function utcPreview(value: string, timeZone: string): string {
  if (!value) return "Server publication time";
  return platformLocalDateTimeToIso(value, timeZone) ?? "Invalid local time";
}

export default function PackagesReviewClient() {
  const router = useRouter();
  const { timeZone } = usePlatformTime();
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [plans, setPlans] = useState<PackagePlanSummary[]>([]);
  const [plan, setPlan] = useState<PackagePlan | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [settings, setSettings] = useState<PlanSettingsForm | null>(null);
  const [settingsReason, setSettingsReason] = useState("");
  const [cloneReason, setCloneReason] = useState("");
  const [publishReason, setPublishReason] = useState("");
  const [publishFrom, setPublishFrom] = useState("");
  const [publishTo, setPublishTo] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [closureAt, setClosureAt] = useState("");

  const isSuperAdmin = actor?.roles.includes("SUPER_ADMIN") ?? false;
  const canRead = actor ? canReadPackages(actor) : false;
  const canManage = actor ? canManagePackages(actor) : false;
  const existingDraft = plans.find((candidate) => candidate.status === "DRAFT");

  const selectedItem = useMemo(
    () => plan?.items.find((item) => item.id === selectedItemId) ?? null,
    [plan, selectedItemId],
  );

  const sortedItems = useMemo(
    () =>
      plan
        ? [...plan.items].sort((left, right) => left.sortOrder - right.sortOrder)
        : [],
    [plan],
  );

  const settingsDirty = useMemo(() => {
    if (!plan || !settings || plan.status !== "DRAFT") {
      return false;
    }

    return JSON.stringify(settings) !== JSON.stringify(settingsFromPlan(plan));
  }, [plan, settings]);

  function applyPlan(nextPlan: PackagePlan) {
    setPlan(nextPlan);
    setSelectedPlanId(nextPlan.id);
    setSettings(settingsFromPlan(nextPlan));
    setClosureAt(isoToPlatformInput(nextPlan.effectiveTo, timeZone));

    const nextItem =
      nextPlan.items.find((item) => item.id === selectedItemId) ??
      [...nextPlan.items].sort((left, right) => left.sortOrder - right.sortOrder)[0] ??
      null;

    setSelectedItemId(nextItem?.id ?? "");
  }

  async function loadPlan(planVersionId: string): Promise<PackagePlan> {
    const response = await fetch(
      `/api/admin/package-plans/${encodeURIComponent(planVersionId)}`,
      { cache: "no-store" },
    );
    const payload = await readApiPayload<PlanPayload>(response);

    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Session expired.");
    }

    if (!response.ok || !payload?.plan) {
      throw new Error(apiMessage(payload, "Unable to load package plan."));
    }

    return payload.plan;
  }

  async function loadPlanList(): Promise<PackagePlanSummary[]> {
    const response = await fetch("/api/admin/package-plans", {
      cache: "no-store",
    });
    const payload = await readApiPayload<PlanListPayload>(response);

    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Session expired.");
    }

    if (!response.ok || !payload?.planVersions) {
      throw new Error(
        apiMessage(payload, "Unable to load package plan versions."),
      );
    }

    return payload.planVersions;
  }

  async function refreshWorkspace(preferredPlanId?: string, message?: string) {
    const nextPlans = await loadPlanList();
    const targetId =
      (preferredPlanId &&
        nextPlans.some((candidate) => candidate.id === preferredPlanId) &&
        preferredPlanId) ||
      nextPlans.find((candidate) => candidate.status === "DRAFT")?.id ||
      nextPlans[0]?.id;

    setPlans(nextPlans);

    if (!targetId) {
      setPlan(null);
      setSelectedPlanId("");
      return;
    }

    const nextPlan = await loadPlan(targetId);
    applyPlan(nextPlan);

    if (message) setSuccess(message);
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const session = await resolveAdminSession();

        if (!session.user) {
          if (session.status === 401 || session.status === 403) {
            router.replace("/login");
            return;
          }
          throw new Error(
            session.message || "Unable to load administrator session.",
          );
        }

        if (!mounted) return;
        setActor(session.user);
        if (!canReadPackages(session.user)) return;

        const nextPlans = await loadPlanList();
        const target =
          nextPlans.find((candidate) => candidate.status === "DRAFT") ??
          nextPlans[0];

        if (!mounted) return;
        setPlans(nextPlans);

        if (target) {
          const nextPlan = await loadPlan(target.id);
          if (mounted) applyPlan(nextPlan);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package plan workspace.",
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
    // Session-first one-time load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function selectPlan(planVersionId: string) {
    if (planVersionId === selectedPlanId || loadingPlan) return;

    if (settingsDirty) {
      setSuccess("");
      setError(
        "Unsaved lifecycle changes detected. Save them before switching plan versions.",
      );
      return;
    }

    setLoadingPlan(true);
    setError("");
    setSuccess("");

    try {
      applyPlan(await loadPlan(planVersionId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load plan.");
    } finally {
      setLoadingPlan(false);
    }
  }

  function selectItem(item: PackagePlanItem) {
    setSelectedItemId(item.id);
    setError("");
    setSuccess("");
  }

  async function submitMutation(
    action: string,
    url: string,
    init: RequestInit,
    preferredPlanId?: string,
  ): Promise<boolean> {
    setBusy(action);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(url, init);
      const payload = await readApiPayload<MutationPayload>(response);

      if (response.status === 401) {
        router.replace("/login");
        return false;
      }

      if (!response.ok) {
        const message = apiMessage(payload, "Package plan request failed.");
        if (response.status === 409 && preferredPlanId) {
          await refreshWorkspace(preferredPlanId);
          throw new Error(`${message} Latest plan data has been reloaded.`);
        }
        throw new Error(message);
      }

      await refreshWorkspace(
        payload?.plan?.id ?? preferredPlanId,
        payload?.message ?? "Package plan updated.",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Package plan request failed.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !plan ||
      !settings ||
      plan.status !== "DRAFT" ||
      !canManage ||
      !settingsDirty ||
      settingsReason.trim().length < 3
    ) {
      return;
    }

    const saved = await submitMutation(
      "settings",
      `/api/admin/package-plans/${encodeURIComponent(plan.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: plan.revision,
          reason: settingsReason.trim(),
          ...settings,
        }),
      },
      plan.id,
    );

    if (saved) setSettingsReason("");
  }

  async function clonePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !plan ||
      plan.status !== "PUBLISHED" ||
      !canManage ||
      existingDraft ||
      cloneReason.trim().length < 3
    ) {
      return;
    }

    const cloned = await submitMutation(
      "clone",
      "/api/admin/package-plans/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanVersionId: plan.id,
          reason: cloneReason.trim(),
        }),
      },
    );

    if (cloned) setCloneReason("");
  }

  async function publishPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !plan ||
      plan.status !== "DRAFT" ||
      !isSuperAdmin ||
      publishReason.trim().length < 3
    ) {
      return;
    }

    if (settingsDirty) {
      setSuccess("");
      setError(
        "Publication blocked: save lifecycle changes before publishing this package plan.",
      );
      return;
    }

    const effectiveFrom = publishFrom
      ? platformLocalDateTimeToIso(publishFrom, timeZone)
      : null;
    const effectiveTo = publishTo
      ? platformLocalDateTimeToIso(publishTo, timeZone)
      : null;

    if (publishFrom && !effectiveFrom) {
      setError(`Effective from is not a valid ${timeZone} local time.`);
      return;
    }
    if (publishTo && !effectiveTo) {
      setError(`Effective to is not a valid ${timeZone} local time.`);
      return;
    }
    if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) {
      setError("Effective to must be later than effective from.");
      return;
    }

    const confirmation = [
      `Publish Package Plan V${plan.versionNumber}?`,
      `Revision: ${plan.revision}`,
      `Packages: ${plan.items.length}`,
      `Settlement timezone source: Platform Operations (${timeZone})`,
      `Effective from: ${
        effectiveFrom
          ? `${formatPlatformDateTime(effectiveFrom, timeZone)} / ${effectiveFrom}`
          : "now (server publication time)"
      }`,
      `Effective to: ${
        effectiveTo
          ? `${formatPlatformDateTime(effectiveTo, timeZone)} / ${effectiveTo}`
          : "open ended"
      }`,
      "Published commercial terms become immutable. Continue?",
    ].join("\n\n");

    if (!window.confirm(confirmation)) return;

    const published = await submitMutation(
      "publish",
      `/api/admin/package-plans/${encodeURIComponent(plan.id)}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: plan.revision,
          reason: publishReason.trim(),
          ...(effectiveFrom ? { effectiveFrom } : {}),
          ...(effectiveTo ? { effectiveTo } : {}),
        }),
      },
      plan.id,
    );

    if (published) {
      setPublishReason("");
      setPublishFrom("");
      setPublishTo("");
    }
  }

  async function closePublishedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !plan ||
      plan.status !== "PUBLISHED" ||
      !isSuperAdmin ||
      !closureAt ||
      closureReason.trim().length < 3
    ) {
      return;
    }

    const effectiveTo = platformLocalDateTimeToIso(closureAt, timeZone);
    if (!effectiveTo) {
      setError(`Closure time is not a valid ${timeZone} local time.`);
      return;
    }

    const closed = await submitMutation(
      "closure",
      `/api/admin/package-plans/${encodeURIComponent(plan.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: plan.revision,
          reason: closureReason.trim(),
          effectiveTo,
        }),
      },
      plan.id,
    );

    if (closed) setClosureReason("");
  }

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading package-plan workspace…</p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className={styles.errorState}>
        <i className="iconoir-warning-triangle" />
        <strong>Package workspace unavailable</strong>
        <p>{error || "Unable to validate the administrator session."}</p>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className={styles.errorState}>
        <i className="iconoir-lock" />
        <strong>packages.read permission required</strong>
        <p>
          This route is hidden unless backend RBAC grants package catalogue
          access. SUPER_ADMIN can delegate it from Roles &amp; Permissions.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>PKG-02 / ACTIVATION POLICY</span>
          <h2>Package Plan Control</h2>
          <p>
            Review the commercial catalogue, manage lifecycle policy and publish
            one complete version atomically. Package-item editing stays in the
            main Packages workspace to avoid duplicate controls.
          </p>
        </div>

        <div className={styles.headerBadges}>
          <span className={styles.boundaryBadge}>
            {plan?.activationTrigger === "PAYMENT_APPROVED"
              ? "AUTO ACTIVATION"
              : plan?.activationTrigger === "MANUAL_ACTIVATION"
                ? "MANUAL ACTIVATION"
                : "ENGINE DEFERRED"}
          </span>
          <span className={styles.roleBadge}>
            {isSuperAdmin ? "SUPER_ADMIN" : "DELEGATED ADMIN"}
          </span>
        </div>
      </header>

      {error || success || (plan?.status === "DRAFT" && settingsDirty) ? (
        <div
          className={styles.flashStack}
          aria-live="polite"
          aria-atomic="true"
        >
          {error ? <div className={styles.errorBanner}>{error}</div> : null}
          {success ? <div className={styles.successBanner}>{success}</div> : null}
          {plan?.status === "DRAFT" && settingsDirty ? (
            <div className={styles.unsavedBanner}>
              <strong>UNSAVED LIFECYCLE CHANGES</strong>
              <span> Save before switching versions or publishing.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.workspace}>
        <aside className={styles.versionPanel}>
          <div className={styles.panelHead}>
            <div>
              <small>VERSION HISTORY</small>
              <h3>Plan versions</h3>
            </div>
            <span>{plans.length}</span>
          </div>

          <div className={styles.versionList}>
            {plans.map((candidate) => (
              <button
                type="button"
                className={`${styles.versionButton} ${
                  selectedPlanId === candidate.id ? styles.selectedVersion : ""
                }`}
                onClick={() => void selectPlan(candidate.id)}
                disabled={loadingPlan}
                key={candidate.id}
              >
                <span className={styles.versionNumber}>
                  V{candidate.versionNumber}
                </span>
                <span>
                  <strong>{candidate.status}</strong>
                  <small>
                    Revision {candidate.revision} · {candidate.itemCount} items
                  </small>
                </span>
                <i className="iconoir-nav-arrow-right" />
              </button>
            ))}
          </div>

          <div className={styles.guardrail}>
            <i className="iconoir-shield-check" />
            <div>
              <strong>Ledger-safe activation boundary</strong>
              <p>
                Package funding uses the audited deposit, accounting and
                subscription workflow. Reward and commission engines remain
                separate downstream modules.
              </p>
            </div>
          </div>
        </aside>

        <main className={styles.detailPanel}>
          {loadingPlan ? (
            <div className={styles.panelLoading}>Loading selected plan…</div>
          ) : !plan || !settings ? (
            <div className={styles.emptyState}>
              <i className="iconoir-box" />
              <strong>No package plan available</strong>
              <p>No package-plan version is currently available.</p>
            </div>
          ) : (
            <>
              <section className={styles.planHero}>
                <div>
                  <span className={styles.kicker}>ATOMIC PLAN VERSION</span>
                  <h3>Package Plan V{plan.versionNumber}</h3>
                  <p>
                    {plan.status === "DRAFT"
                      ? "Editable lifecycle draft. Commercial package items are edited only from the main Packages workspace."
                      : "Published commercial terms are immutable and resolved by event time."}
                  </p>
                </div>

                <div className={styles.planIdentity}>
                  <span
                    className={`${styles.statusBadge} ${
                      plan.status === "DRAFT"
                        ? styles.draftBadge
                        : styles.publishedBadge
                    }`}
                  >
                    {plan.status}
                  </span>
                  <strong>REV {plan.revision}</strong>
                </div>
              </section>

              <section className={styles.metrics}>
                <article>
                  <small>PACKAGE MODE</small>
                  <strong>{enumLabel(plan.activePackageMode)}</strong>
                </article>
                <article>
                  <small>MIGRATION</small>
                  <strong>{enumLabel(plan.migrationMode)}</strong>
                </article>
                <article>
                  <small>EFFECTIVE FROM</small>
                  <strong>{formatDate(plan.effectiveFrom)}</strong>
                </article>
                <article>
                  <small>ITEMS</small>
                  <strong>{plan.items.length}</strong>
                </article>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <small>PLAN-WIDE POLICY</small>
                    <h3>Lifecycle settings</h3>
                  </div>
                  <span>Platform: {timeZone}</span>
                </div>

                <form className={styles.form} onSubmit={saveSettings}>
                  <div className={styles.formGrid}>
                    <SelectField
                      label="Active package mode"
                      value={settings.activePackageMode}
                      options={ACTIVE_PACKAGE_MODES}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(value) =>
                        setSettings({ ...settings, activePackageMode: value })
                      }
                    />
                    <SelectField
                      label="Multiple-package basis"
                      value={settings.multipleActivePackageBasis}
                      options={MULTIPLE_ACTIVE_PACKAGE_BASES}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          multipleActivePackageBasis: value,
                        })
                      }
                    />
                    <SelectField
                      label="Activation trigger"
                      value={settings.activationTrigger}
                      options={PACKAGE_ACTIVATION_TRIGGERS}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(value) =>
                        setSettings({ ...settings, activationTrigger: value })
                      }
                    />
                    <div className={styles.guardrail}>
                      <i className="iconoir-shield-check" />
                      <div>
                        <strong>
                          {settings.activationTrigger === "PAYMENT_APPROVED"
                            ? "Automatic activation after accounting"
                            : settings.activationTrigger === "MANUAL_ACTIVATION"
                              ? "Authorized manual activation"
                              : "Activation engine deferred"}
                        </strong>
                        <p>
                          {settings.activationTrigger === "PAYMENT_APPROVED"
                            ? "Approved payment is posted to accounting first, then the purchased package activates automatically and idempotently."
                            : settings.activationTrigger === "MANUAL_ACTIVATION"
                              ? "Approved payment is posted to accounting first, then an authorized operator completes package activation."
                              : "This trigger can be stored for a future plan, but activation remains blocked until its dedicated engine exists."}
                        </p>
                      </div>
                    </div>
                    <SelectField
                      label="Migration mode"
                      value={settings.migrationMode}
                      options={PACKAGE_PLAN_MIGRATION_MODES}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(value) =>
                        setSettings({ ...settings, migrationMode: value })
                      }
                    />
                    <SelectField
                      label="Renewal mode"
                      value={settings.renewalMode}
                      options={PACKAGE_RENEWAL_MODES}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(value) =>
                        setSettings({ ...settings, renewalMode: value })
                      }
                    />
                    <div className={styles.guardrail}>
                      <i className="iconoir-clock" />
                      <div>
                        <strong>Settlement timezone: {timeZone}</strong>
                        <p>
                          New package activations snapshot Platform Operations.
                          Existing subscription snapshots remain immutable. Legacy
                          plan value {plan.settlementTimezone} is retained for
                          history only and is not editable here.
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className={styles.switchRow}>
                    <span>
                      <strong>Package upgrades enabled</strong>
                      <small>
                        Publication remains blocked while upgrade accounting and
                        lifecycle support is deferred.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.upgradesEnabled}
                      disabled={plan.status !== "DRAFT" || !canManage}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          upgradesEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>

                  {plan.status === "DRAFT" && canManage ? (
                    <div className={styles.auditAction}>
                      <Field label="Audit reason">
                        <textarea
                          required
                          minLength={3}
                          maxLength={500}
                          value={settingsReason}
                          onChange={(event) =>
                            setSettingsReason(event.target.value)
                          }
                          placeholder="Why are these plan-wide settings changing?"
                        />
                      </Field>
                      <button
                        type="submit"
                        disabled={
                          busy !== "" ||
                          !settingsDirty ||
                          settingsReason.trim().length < 3
                        }
                      >
                        {busy === "settings"
                          ? "Saving…"
                          : settingsDirty
                            ? "Save plan settings"
                            : "No lifecycle changes"}
                      </button>
                    </div>
                  ) : null}
                </form>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <small>VERSIONED CATALOGUE · REVIEW ONLY</small>
                    <h3>Package items</h3>
                  </div>
                  <span>{plan.items.length} commercial term sets</span>
                </div>

                <div className={styles.itemGrid}>
                  {sortedItems.map((item) => (
                    <button
                      type="button"
                      className={`${styles.itemCard} ${
                        selectedItemId === item.id ? styles.selectedItem : ""
                      }`}
                      onClick={() => selectItem(item)}
                      key={item.id}
                    >
                      <span className={styles.itemOrder}>
                        {String(item.sortOrder).padStart(2, "0")}
                      </span>
                      <small>{item.packageCode}</small>
                      <strong>{item.displayName}</strong>
                      <b>
                        {investmentRangeLabel(item)} {item.currency}
                      </b>
                      <span>{rewardRateLabel(item)} USER net / day</span>
                      <span>{item.durationDays} earning days</span>
                      <span>{capitalReturnSummary(item)}</span>
                      <em>{enumLabel(item.availability)}</em>
                    </button>
                  ))}
                </div>

                {selectedItem ? (
                  <div className={styles.itemEditor}>
                    <div className={styles.editorHead}>
                      <div>
                        <small>COMMERCIAL SNAPSHOT {selectedItem.packageCode}</small>
                        <h4>{selectedItem.displayName}</h4>
                      </div>
                      <span>{maximumSummary(selectedItem)}</span>
                    </div>

                    <div className={styles.formGrid}>
                      <Field label="Investment range">
                        <input
                          readOnly
                          value={`${investmentRangeLabel(selectedItem)} ${selectedItem.currency}`}
                        />
                      </Field>
                      <Field label="USER net daily profit">
                        <input readOnly value={`${rewardRateLabel(selectedItem)} / day`} />
                      </Field>
                      <Field label="Earning duration">
                        <input readOnly value={`${selectedItem.durationDays} days`} />
                      </Field>
                      <Field label="Capital return">
                        <input readOnly value={capitalReturnSummary(selectedItem)} />
                      </Field>
                      <Field label="Availability">
                        <input readOnly value={enumLabel(selectedItem.availability)} />
                      </Field>
                      <Field label="Compatibility price (system derived)">
                        <input
                          readOnly
                          value={`${decimalLabel(selectedItem.price)} ${selectedItem.currency}`}
                        />
                      </Field>
                      <Field label="Maximum USER profit">
                        <input
                          readOnly
                          value={
                            selectedItem.maximumProfit === null
                              ? "No finite maximum"
                              : `${decimalLabel(selectedItem.maximumProfit)} ${selectedItem.currency}`
                          }
                        />
                      </Field>
                      <Field label="Maximum total return">
                        <input
                          readOnly
                          value={
                            selectedItem.maximumTotalReturn === null
                              ? "No finite maximum"
                              : `${decimalLabel(selectedItem.maximumTotalReturn)} ${selectedItem.currency}`
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.guardrail}>
                      <i className="iconoir-lock" />
                      <div>
                        <strong>System-derived lifecycle terms are review-only</strong>
                        <p>
                          {enumLabel(selectedItem.rewardRateMeaning)} · {enumLabel(selectedItem.capBasis)} · compatibility multiplier {decimalLabel(selectedItem.capMultiplier)} · {enumLabel(selectedItem.rewardStartMode)} · {enumLabel(selectedItem.rewardFrequency)} · {enumLabel(selectedItem.cycleDayMode)} · {enumLabel(selectedItem.rewardDayMode)} · {enumLabel(selectedItem.cycleEndAction)}.
                        </p>
                      </div>
                    </div>

                    {plan.status === "DRAFT" && canManage ? (
                      <div className={styles.auditAction}>
                        <div>
                          <strong>Edit commercial package terms</strong>
                          <p>
                            The main Packages workspace is the single package-item
                            editor. Advanced controls stay focused on lifecycle,
                            version review and atomic publication.
                          </p>
                        </div>
                        <button type="button" onClick={() => router.push("/packages")}>
                          Open package editor
                        </button>
                      </div>
                    ) : (
                      <p className={styles.immutableNote}>
                        <i className="iconoir-lock" /> Published item terms are
                        immutable. Clone this version before making corrections.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>

              <section className={styles.releaseGrid}>
                {plan.status === "DRAFT" ? (
                  <article className={styles.releaseCard}>
                    <div className={styles.sectionHead}>
                      <div>
                        <small>ATOMIC RELEASE</small>
                        <h3>Publish V{plan.versionNumber}</h3>
                      </div>
                      <i className="iconoir-upload" />
                    </div>

                    {!isSuperAdmin ? (
                      <div className={styles.restricted}>
                        <i className="iconoir-lock" />
                        <strong>SUPER_ADMIN publication only</strong>
                        <p>Delegated draft permission cannot publish a plan.</p>
                      </div>
                    ) : (
                      <form className={styles.form} onSubmit={publishPlan}>
                        <div className={styles.twoColumns}>
                          <Field
                            label={`Effective from (${timeZone})`}
                            help="Empty means now. Converted to UTC for the API."
                          >
                            <input
                              type="datetime-local"
                              value={publishFrom}
                              onChange={(event) => setPublishFrom(event.target.value)}
                            />
                          </Field>
                          <Field
                            label={`Effective to (${timeZone})`}
                            help="Optional exclusive end. Converted to UTC for the API."
                          >
                            <input
                              type="datetime-local"
                              value={publishTo}
                              onChange={(event) => setPublishTo(event.target.value)}
                            />
                          </Field>
                        </div>

                        <div className={styles.guardrail}>
                          <i className="iconoir-clock" />
                          <div>
                            <strong>Publication time preview</strong>
                            <p>
                              From: {publishFrom || "Now"} {timeZone} → {utcPreview(publishFrom, timeZone)}
                              <br />
                              To: {publishTo || "Open ended"} {publishTo ? timeZone : ""} → {publishTo ? utcPreview(publishTo, timeZone) : "Open ended"}
                            </p>
                          </div>
                        </div>

                        <Field label="Publication reason">
                          <textarea
                            required
                            minLength={3}
                            maxLength={500}
                            value={publishReason}
                            onChange={(event) => setPublishReason(event.target.value)}
                            placeholder="Confirm founder-reviewed publication."
                          />
                        </Field>
                        <button
                          type="submit"
                          disabled={
                            busy !== "" ||
                            publishReason.trim().length < 3 ||
                            settingsDirty
                          }
                        >
                          {busy === "publish"
                            ? "Publishing…"
                            : settingsDirty
                              ? "Save lifecycle changes before publishing"
                              : "Review & publish atomically"}
                        </button>
                      </form>
                    )}
                  </article>
                ) : (
                  <>
                    <article className={styles.releaseCard}>
                      <div className={styles.sectionHead}>
                        <div>
                          <small>NEXT VERSION</small>
                          <h3>Clone published plan</h3>
                        </div>
                        <i className="iconoir-copy" />
                      </div>

                      {!canManage ? (
                        <div className={styles.restricted}>
                          <i className="iconoir-lock" />
                          <strong>Draft permission required</strong>
                        </div>
                      ) : existingDraft ? (
                        <div className={styles.restricted}>
                          <i className="iconoir-info-empty" />
                          <strong>
                            V{existingDraft.versionNumber} draft already exists
                          </strong>
                          <p>Only one editable draft may exist at a time.</p>
                        </div>
                      ) : (
                        <form className={styles.form} onSubmit={clonePlan}>
                          <Field label="Clone reason">
                            <textarea
                              required
                              minLength={3}
                              maxLength={500}
                              value={cloneReason}
                              onChange={(event) => setCloneReason(event.target.value)}
                              placeholder="Why is a successor version required?"
                            />
                          </Field>
                          <button
                            type="submit"
                            disabled={busy !== "" || cloneReason.trim().length < 3}
                          >
                            {busy === "clone"
                              ? "Cloning…"
                              : "Create successor draft"}
                          </button>
                        </form>
                      )}
                    </article>

                    <article className={styles.releaseCard}>
                      <div className={styles.sectionHead}>
                        <div>
                          <small>EFFECTIVE RANGE</small>
                          <h3>Schedule plan closure</h3>
                        </div>
                        <i className="iconoir-calendar" />
                      </div>

                      {!isSuperAdmin ? (
                        <div className={styles.restricted}>
                          <i className="iconoir-lock" />
                          <strong>SUPER_ADMIN closure only</strong>
                        </div>
                      ) : (
                        <form className={styles.form} onSubmit={closePublishedPlan}>
                          <Field
                            label={`Effective to (${timeZone})`}
                            help="Converted to UTC for the API."
                          >
                            <input
                              required
                              type="datetime-local"
                              value={closureAt}
                              onChange={(event) => setClosureAt(event.target.value)}
                            />
                          </Field>
                          <Field label="Closure reason">
                            <textarea
                              required
                              minLength={3}
                              maxLength={500}
                              value={closureReason}
                              onChange={(event) => setClosureReason(event.target.value)}
                              placeholder="Why should this published range close?"
                            />
                          </Field>
                          <button
                            type="submit"
                            disabled={
                              busy !== "" ||
                              !closureAt ||
                              closureReason.trim().length < 3
                            }
                          >
                            {busy === "closure"
                              ? "Scheduling…"
                              : "Schedule closure"}
                          </button>
                        </form>
                      )}
                    </article>
                  </>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
