"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import { resolveAdminSession } from "@/lib/admin-session-client";
import {
  ACTIVE_PACKAGE_MODES,
  apiMessage,
  enumLabel,
  MULTIPLE_ACTIVE_PACKAGE_BASES,
  PACKAGE_ACTIVATION_TRIGGERS,
  PACKAGE_AVAILABILITIES,
  PACKAGE_CAP_BASES,
  PACKAGE_CAP_REACHED_ACTIONS,
  PACKAGE_CYCLE_DAY_MODES,
  PACKAGE_CYCLE_END_ACTIONS,
  PACKAGE_PLAN_MIGRATION_MODES,
  PACKAGE_PRINCIPAL_TREATMENTS,
  PACKAGE_RENEWAL_MODES,
  PACKAGE_REWARD_DAY_MODES,
  PACKAGE_REWARD_FREQUENCIES,
  PACKAGE_REWARD_RATE_MEANINGS,
  PACKAGE_REWARD_RATE_MODES,
  PACKAGE_REWARD_START_MODES,
  readApiPayload,
  rewardRateLabel,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanItem,
  type PackagePlanSummary,
} from "@/lib/packages";
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
  revision?: number;
  item?: PackagePlanItem;
}

interface PlanSettingsForm {
  activePackageMode: string;
  multipleActivePackageBasis: string;
  activationTrigger: string;
  migrationMode: string;
  renewalMode: string;
  upgradesEnabled: boolean;
  settlementTimezone: string;
}

interface ItemForm {
  displayName: string;
  slug: string;
  sortOrder: string;
  availability: string;
  price: string;
  currency: string;
  rewardRateMode: string;
  fixedRewardRate: string;
  minimumRewardRate: string;
  maximumRewardRate: string;
  rewardRateMeaning: string;
  capBasis: string;
  capMultiplier: string;
  principalTreatment: string;
  goalDays: string;
  cycleDays: string;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  cycleEndAction: string;
  capReachedAction: string;
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
    settlementTimezone: plan.settlementTimezone,
  };
}

function itemFromPlan(item: PackagePlanItem): ItemForm {
  return {
    displayName: item.displayName,
    slug: item.slug,
    sortOrder: String(item.sortOrder),
    availability: item.availability,
    price: item.price,
    currency: item.currency,
    rewardRateMode: item.rewardRateMode,
    fixedRewardRate: item.fixedRewardRate ?? "",
    minimumRewardRate: item.minimumRewardRate ?? "",
    maximumRewardRate: item.maximumRewardRate ?? "",
    rewardRateMeaning: item.rewardRateMeaning,
    capBasis: item.capBasis,
    capMultiplier: item.capMultiplier,
    principalTreatment: item.principalTreatment,
    goalDays: String(item.goalDays),
    cycleDays: String(item.cycleDays),
    rewardStartMode: item.rewardStartMode,
    rewardFrequency: item.rewardFrequency,
    cycleDayMode: item.cycleDayMode,
    rewardDayMode: item.rewardDayMode,
    cycleEndAction: item.cycleEndAction,
    capReachedAction: item.capReachedAction,
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function toUtcInput(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

function utcInputToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}:00.000Z`).toISOString();
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

export default function PackagesClient() {
  const router = useRouter();
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
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [itemReason, setItemReason] = useState("");
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

  function applyPlan(nextPlan: PackagePlan) {
    setPlan(nextPlan);
    setSelectedPlanId(nextPlan.id);
    setSettings(settingsFromPlan(nextPlan));
    setClosureAt(toUtcInput(nextPlan.effectiveTo));

    const nextItem =
      nextPlan.items.find((item) => item.id === selectedItemId) ??
      nextPlan.items[0] ??
      null;

    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(nextItem ? itemFromPlan(nextItem) : null);
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

    if (message) {
      setSuccess(message);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Startbar, topbar and this workspace share one in-flight session
        // request. Package requests begin only after token refresh is settled.
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

        if (!mounted) {
          return;
        }

        setActor(session.user);

        if (!canReadPackages(session.user)) {
          return;
        }

        const nextPlans = await loadPlanList();
        const target =
          nextPlans.find((candidate) => candidate.status === "DRAFT") ??
          nextPlans[0];

        if (!mounted) {
          return;
        }

        setPlans(nextPlans);

        if (target) {
          const nextPlan = await loadPlan(target.id);

          if (mounted) {
            applyPlan(nextPlan);
          }
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
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
    // The initial request is intentionally a one-time, session-first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function selectPlan(planVersionId: string) {
    if (planVersionId === selectedPlanId || loadingPlan) {
      return;
    }

    setLoadingPlan(true);
    setError("");
    setSuccess("");

    try {
      const nextPlan = await loadPlan(planVersionId);
      applyPlan(nextPlan);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load plan.",
      );
    } finally {
      setLoadingPlan(false);
    }
  }

  function selectItem(item: PackagePlanItem) {
    setSelectedItemId(item.id);
    setItemForm(itemFromPlan(item));
    setItemReason("");
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

    if (!plan || !settings || plan.status !== "DRAFT" || !canManage) {
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

    if (saved) {
      setSettingsReason("");
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !plan ||
      !selectedItem ||
      !itemForm ||
      plan.status !== "DRAFT" ||
      !canManage
    ) {
      return;
    }

    const usesFixedRate = itemForm.rewardRateMode === "FIXED";

    const saved = await submitMutation(
      "item",
      `/api/admin/package-plans/${encodeURIComponent(
        plan.id,
      )}/items/${encodeURIComponent(selectedItem.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: plan.revision,
          reason: itemReason.trim(),
          displayName: itemForm.displayName.trim(),
          slug: itemForm.slug.trim(),
          sortOrder: Number(itemForm.sortOrder),
          availability: itemForm.availability,
          price: itemForm.price.trim(),
          currency: itemForm.currency,
          rewardRateMode: itemForm.rewardRateMode,
          fixedRewardRate: usesFixedRate
            ? itemForm.fixedRewardRate.trim()
            : null,
          minimumRewardRate: usesFixedRate
            ? null
            : itemForm.minimumRewardRate.trim(),
          maximumRewardRate: usesFixedRate
            ? null
            : itemForm.maximumRewardRate.trim(),
          rewardRateMeaning: itemForm.rewardRateMeaning,
          capBasis: itemForm.capBasis,
          capMultiplier: itemForm.capMultiplier.trim(),
          principalTreatment: itemForm.principalTreatment,
          goalDays: Number(itemForm.goalDays),
          cycleDays: Number(itemForm.cycleDays),
          rewardStartMode: itemForm.rewardStartMode,
          rewardFrequency: itemForm.rewardFrequency,
          cycleDayMode: itemForm.cycleDayMode,
          rewardDayMode: itemForm.rewardDayMode,
          cycleEndAction: itemForm.cycleEndAction,
          capReachedAction: itemForm.capReachedAction,
        }),
      },
      plan.id,
    );

    if (saved) {
      setItemReason("");
    }
  }

  async function clonePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!plan || plan.status !== "PUBLISHED" || !canManage || existingDraft) {
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

    if (cloned) {
      setCloneReason("");
    }
  }

  async function publishPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!plan || plan.status !== "DRAFT" || !isSuperAdmin) {
      return;
    }

    const effectiveFrom = utcInputToIso(publishFrom);
    const effectiveTo = utcInputToIso(publishTo);

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

    if (!plan || plan.status !== "PUBLISHED" || !isSuperAdmin || !closureAt) {
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
          effectiveTo: utcInputToIso(closureAt),
        }),
      },
      plan.id,
    );

    if (closed) {
      setClosureReason("");
    }
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
          <span>PKG-01 FOUNDATION</span>
          <h2>Package Plan Control</h2>
          <p>
            Review exact USDT terms, manage one audited draft and publish a
            whole catalogue atomically.
          </p>
        </div>

        <div className={styles.headerBadges}>
          <span className={styles.boundaryBadge}>ACTIVATION DEFERRED</span>
          <span className={styles.roleBadge}>
            {isSuperAdmin ? "SUPER_ADMIN" : "DELEGATED ADMIN"}
          </span>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {success ? <div className={styles.successBanner}>{success}</div> : null}

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
              <strong>Ledger-safe boundary</strong>
              <p>
                No purchase, activation, balance or earning mutation exists.
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
              <p>The migration-owned V1 draft has not been installed.</p>
            </div>
          ) : (
            <>
              <section className={styles.planHero}>
                <div>
                  <span className={styles.kicker}>ATOMIC PLAN VERSION</span>
                  <h3>Package Plan V{plan.versionNumber}</h3>
                  <p>
                    {plan.status === "DRAFT"
                      ? "Editable draft. Every successful mutation advances one shared revision."
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
                  <strong>{formatDate(plan.effectiveFrom)} UTC</strong>
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
                  <span>{plan.settlementTimezone}</span>
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
                    <Field
                      label="Settlement timezone"
                      help="Use an IANA timezone. Approved V1 value is UTC."
                    >
                      <input
                        required
                        maxLength={64}
                        value={settings.settlementTimezone}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            settlementTimezone: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <label className={styles.switchRow}>
                    <span>
                      <strong>Package upgrades enabled</strong>
                      <small>
                        Publication is blocked while this is enabled because
                        payment, subscription and ledger support is deferred.
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
                          busy !== "" || settingsReason.trim().length < 3
                        }
                      >
                        {busy === "settings" ? "Saving…" : "Save plan settings"}
                      </button>
                    </div>
                  ) : null}
                </form>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <small>VERSIONED CATALOGUE</small>
                    <h3>Package items</h3>
                  </div>
                  <span>{plan.items.length} exact term sets</span>
                </div>

                <div className={styles.itemGrid}>
                  {plan.items.map((item) => (
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
                        {item.price} {item.currency}
                      </b>
                      <span>{rewardRateLabel(item)} user/net</span>
                      <em>{enumLabel(item.availability)}</em>
                    </button>
                  ))}
                </div>

                {selectedItem && itemForm ? (
                  <form className={styles.itemEditor} onSubmit={saveItem}>
                    <div className={styles.editorHead}>
                      <div>
                        <small>EDITING {selectedItem.packageCode}</small>
                        <h4>{selectedItem.displayName}</h4>
                      </div>
                      <span>
                        Max total {selectedItem.maximumTotalReturn}{" "}
                        {selectedItem.currency}
                      </span>
                    </div>

                    <div className={styles.formGrid}>
                      <Field label="Display name">
                        <input
                          required
                          maxLength={100}
                          value={itemForm.displayName}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              displayName: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Slug">
                        <input
                          required
                          maxLength={100}
                          value={itemForm.slug}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              slug: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Sort order">
                        <input
                          required
                          type="number"
                          min={1}
                          max={10000}
                          value={itemForm.sortOrder}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              sortOrder: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <SelectField
                        label="Availability"
                        value={itemForm.availability}
                        options={PACKAGE_AVAILABILITIES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, availability: value })
                        }
                      />
                      <Field label="Price" help="Exact DECIMAL(20,8) string">
                        <input
                          required
                          inputMode="decimal"
                          value={itemForm.price}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              price: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Currency">
                        <input value={itemForm.currency} disabled />
                      </Field>
                      <SelectField
                        label="Reward-rate mode"
                        value={itemForm.rewardRateMode}
                        options={PACKAGE_REWARD_RATE_MODES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, rewardRateMode: value })
                        }
                      />
                      <SelectField
                        label="Displayed-rate meaning"
                        value={itemForm.rewardRateMeaning}
                        options={PACKAGE_REWARD_RATE_MEANINGS}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, rewardRateMeaning: value })
                        }
                      />
                      {itemForm.rewardRateMode === "FIXED" ? (
                        <Field label="Fixed rate %">
                          <input
                            required
                            inputMode="decimal"
                            value={itemForm.fixedRewardRate}
                            disabled={plan.status !== "DRAFT" || !canManage}
                            onChange={(event) =>
                              setItemForm({
                                ...itemForm,
                                fixedRewardRate: event.target.value,
                              })
                            }
                          />
                        </Field>
                      ) : (
                        <>
                          <Field label="Minimum rate %">
                            <input
                              required
                              inputMode="decimal"
                              value={itemForm.minimumRewardRate}
                              disabled={plan.status !== "DRAFT" || !canManage}
                              onChange={(event) =>
                                setItemForm({
                                  ...itemForm,
                                  minimumRewardRate: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Maximum rate %">
                            <input
                              required
                              inputMode="decimal"
                              value={itemForm.maximumRewardRate}
                              disabled={plan.status !== "DRAFT" || !canManage}
                              onChange={(event) =>
                                setItemForm({
                                  ...itemForm,
                                  maximumRewardRate: event.target.value,
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                      <SelectField
                        label="Cap basis"
                        value={itemForm.capBasis}
                        options={PACKAGE_CAP_BASES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, capBasis: value })
                        }
                      />
                      <Field label="Cap multiplier">
                        <input
                          required
                          inputMode="decimal"
                          value={itemForm.capMultiplier}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              capMultiplier: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <SelectField
                        label="Principal treatment"
                        value={itemForm.principalTreatment}
                        options={PACKAGE_PRINCIPAL_TREATMENTS}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({
                            ...itemForm,
                            principalTreatment: value,
                          })
                        }
                      />
                      <Field label="Goal / lifetime days">
                        <input
                          required
                          type="number"
                          min={1}
                          max={36500}
                          value={itemForm.goalDays}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              goalDays: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Cycle days">
                        <input
                          required
                          type="number"
                          min={1}
                          max={36500}
                          value={itemForm.cycleDays}
                          disabled={plan.status !== "DRAFT" || !canManage}
                          onChange={(event) =>
                            setItemForm({
                              ...itemForm,
                              cycleDays: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <SelectField
                        label="Reward start"
                        value={itemForm.rewardStartMode}
                        options={PACKAGE_REWARD_START_MODES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, rewardStartMode: value })
                        }
                      />
                      <SelectField
                        label="Reward frequency"
                        value={itemForm.rewardFrequency}
                        options={PACKAGE_REWARD_FREQUENCIES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, rewardFrequency: value })
                        }
                      />
                      <SelectField
                        label="Cycle-day mode"
                        value={itemForm.cycleDayMode}
                        options={PACKAGE_CYCLE_DAY_MODES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, cycleDayMode: value })
                        }
                      />
                      <SelectField
                        label="Reward-day mode"
                        value={itemForm.rewardDayMode}
                        options={PACKAGE_REWARD_DAY_MODES}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, rewardDayMode: value })
                        }
                      />
                      <SelectField
                        label="Cycle-end action"
                        value={itemForm.cycleEndAction}
                        options={PACKAGE_CYCLE_END_ACTIONS}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, cycleEndAction: value })
                        }
                      />
                      <SelectField
                        label="Cap-reached action"
                        value={itemForm.capReachedAction}
                        options={PACKAGE_CAP_REACHED_ACTIONS}
                        disabled={plan.status !== "DRAFT" || !canManage}
                        onChange={(value) =>
                          setItemForm({ ...itemForm, capReachedAction: value })
                        }
                      />
                    </div>

                    {plan.status === "DRAFT" && canManage ? (
                      <div className={styles.auditAction}>
                        <Field label="Audit reason">
                          <textarea
                            required
                            minLength={3}
                            maxLength={500}
                            value={itemReason}
                            onChange={(event) =>
                              setItemReason(event.target.value)
                            }
                            placeholder={`Why are ${selectedItem.packageCode} terms changing?`}
                          />
                        </Field>
                        <button
                          type="submit"
                          disabled={busy !== "" || itemReason.trim().length < 3}
                        >
                          {busy === "item" ? "Saving…" : "Save package item"}
                        </button>
                      </div>
                    ) : (
                      <p className={styles.immutableNote}>
                        <i className="iconoir-lock" /> Published item terms are
                        immutable. Clone this version to make a correction.
                      </p>
                    )}
                  </form>
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
                            label="Effective from (UTC)"
                            help="Empty means now."
                          >
                            <input
                              type="datetime-local"
                              value={publishFrom}
                              onChange={(event) =>
                                setPublishFrom(event.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Effective to (UTC)"
                            help="Optional exclusive end."
                          >
                            <input
                              type="datetime-local"
                              value={publishTo}
                              onChange={(event) =>
                                setPublishTo(event.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Publication reason">
                          <textarea
                            required
                            minLength={3}
                            maxLength={500}
                            value={publishReason}
                            onChange={(event) =>
                              setPublishReason(event.target.value)
                            }
                            placeholder="Confirm founder-reviewed publication."
                          />
                        </Field>
                        <button
                          type="submit"
                          disabled={
                            busy !== "" || publishReason.trim().length < 3
                          }
                        >
                          {busy === "publish"
                            ? "Publishing…"
                            : "Publish atomically"}
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
                              onChange={(event) =>
                                setCloneReason(event.target.value)
                              }
                              placeholder="Why is a successor version required?"
                            />
                          </Field>
                          <button
                            type="submit"
                            disabled={
                              busy !== "" || cloneReason.trim().length < 3
                            }
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
                        <form
                          className={styles.form}
                          onSubmit={closePublishedPlan}
                        >
                          <Field label="Effective to (UTC)">
                            <input
                              required
                              type="datetime-local"
                              value={closureAt}
                              onChange={(event) =>
                                setClosureAt(event.target.value)
                              }
                            />
                          </Field>
                          <Field label="Closure reason">
                            <textarea
                              required
                              minLength={3}
                              maxLength={500}
                              value={closureReason}
                              onChange={(event) =>
                                setClosureReason(event.target.value)
                              }
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
