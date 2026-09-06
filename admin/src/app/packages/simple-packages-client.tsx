"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  apiMessage,
  enumLabel,
  investmentRangeLabel,
  principalReturnLabel,
  readApiPayload,
  rewardRateLabel,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanItem,
  type PackagePlanSummary,
} from "@/lib/packages";
import { formatPlatformDateTime } from "@/lib/platform-time";
import PackageItemEditor from "./package-item-editor";
import styles from "./simple-packages.module.css";

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

function currentEffectivePlan(
  plans: PackagePlanSummary[],
): PackagePlanSummary | null {
  const now = Date.now();
  return (
    plans
      .filter((plan) => {
        if (plan.status !== "PUBLISHED" || !plan.effectiveFrom) return false;
        const from = new Date(plan.effectiveFrom).getTime();
        const to = plan.effectiveTo ? new Date(plan.effectiveTo).getTime() : null;
        return from <= now && (to === null || to > now);
      })
      .sort((left, right) => {
        const leftFrom = left.effectiveFrom
          ? new Date(left.effectiveFrom).getTime()
          : 0;
        const rightFrom = right.effectiveFrom
          ? new Date(right.effectiveFrom).getTime()
          : 0;
        return rightFrom - leftFrom;
      })[0] ?? null
  );
}

function latestPublishedPlan(
  plans: PackagePlanSummary[],
): PackagePlanSummary | null {
  return (
    plans
      .filter((plan) => plan.status === "PUBLISHED")
      .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
  );
}

function formatWhen(value: string | null): string {
  if (!value) return "Open ended";
  const formatted = formatPlatformDateTime(value);
  return formatted === "—" ? "Not set" : formatted;
}

async function fetchPlan(planVersionId: string): Promise<PackagePlan> {
  const response = await fetch(
    `/api/admin/package-plans/${encodeURIComponent(planVersionId)}`,
    { cache: "no-store" },
  );
  const payload = await readApiPayload<PlanPayload>(response);

  if (!response.ok || !payload?.plan) {
    throw new Error(apiMessage(payload, "Unable to load package plan."));
  }

  return payload.plan;
}

export default function SimplePackagesClient() {
  const router = useRouter();
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [plans, setPlans] = useState<PackagePlanSummary[]>([]);
  const [livePlan, setLivePlan] = useState<PackagePlan | null>(null);
  const [draftPlan, setDraftPlan] = useState<PackagePlan | null>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [cloneReason, setCloneReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const liveSummary = useMemo(() => currentEffectivePlan(plans), [plans]);
  const draftSummary = useMemo(
    () => plans.find((plan) => plan.status === "DRAFT") ?? null,
    [plans],
  );
  const sourceForClone = useMemo(
    () => liveSummary ?? latestPublishedPlan(plans),
    [liveSummary, plans],
  );
  const canRead = actor ? canReadPackages(actor) : false;
  const canManage = actor ? canManagePackages(actor) : false;

  const selectedItem: PackagePlanItem | null = useMemo(
    () =>
      draftPlan?.items.find((item) => item.id === selectedItemId) ??
      draftPlan?.items[0] ??
      null,
    [draftPlan, selectedItemId],
  );

  async function reload(message?: string) {
    const listResponse = await fetch("/api/admin/package-plans", {
      cache: "no-store",
    });
    const listPayload = await readApiPayload<PlanListPayload>(listResponse);

    if (listResponse.status === 401) {
      router.replace("/login");
      return;
    }

    if (!listResponse.ok || !listPayload?.planVersions) {
      throw new Error(
        apiMessage(listPayload, "Unable to load package plan versions."),
      );
    }

    const nextPlans = listPayload.planVersions;
    const nextLiveSummary = currentEffectivePlan(nextPlans);
    const nextDraftSummary =
      nextPlans.find((plan) => plan.status === "DRAFT") ?? null;

    const [nextLivePlan, nextDraftPlan] = await Promise.all([
      nextLiveSummary ? fetchPlan(nextLiveSummary.id) : Promise.resolve(null),
      nextDraftSummary ? fetchPlan(nextDraftSummary.id) : Promise.resolve(null),
    ]);

    setPlans(nextPlans);
    setLivePlan(nextLivePlan);
    setDraftPlan(nextDraftPlan);
    setCreatingItem(false);
    setSelectedItemId((current) => {
      if (nextDraftPlan?.items.some((item) => item.id === current)) {
        return current;
      }
      return nextDraftPlan?.items[0]?.id ?? "";
    });

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
            session.message || "Unable to validate administrator session.",
          );
        }

        if (!mounted) return;
        setActor(session.user);

        if (!canReadPackages(session.user)) return;
        await reload();
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package configuration.",
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
    // Session is resolved before package requests on the initial page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function createDraft() {
    if (
      !sourceForClone ||
      draftSummary ||
      !canManage ||
      cloneReason.trim().length < 3 ||
      busy
    ) {
      return;
    }

    setBusy("clone");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/package-plans/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanVersionId: sourceForClone.id,
          reason: cloneReason.trim(),
        }),
      });
      const payload = await readApiPayload<MutationPayload>(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Unable to create package draft."));
      }

      setCloneReason("");
      await reload(payload?.message ?? "Package draft created.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create package draft.",
      );
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading packages…</p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className={styles.error}>
        {error || "Package configuration is unavailable."}
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className={styles.error}>
        packages.read permission is required to view package configuration.
      </div>
    );
  }

  const liveItems = livePlan
    ? [...livePlan.items].sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
  const draftItems = draftPlan
    ? [...draftPlan.items].sort((left, right) => left.sortOrder - right.sortOrder)
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PACKAGE CONTROL</span>
          <h1>Packages</h1>
          <p>
            Commercial package terms are loaded from the versioned MySQL
            catalogue. Names, investment ranges, rates and durations are not
            embedded in this Admin application.
          </p>
        </div>
        <Link className={styles.advancedLink} href="/packages/advanced">
          Advanced lifecycle &amp; release controls
        </Link>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <section className={styles.statusGrid}>
        <article className={styles.statusCard}>
          <small>LIVE FOR USERS</small>
          <strong>{liveSummary ? `Plan V${liveSummary.versionNumber}` : "No effective plan"}</strong>
          <span>
            {liveSummary
              ? `${liveItems.length} package items · ${formatWhen(liveSummary.effectiveTo)}`
              : "No published package catalogue is currently effective."}
          </span>
        </article>
        <article className={styles.statusCard}>
          <small>EDITABLE DRAFT</small>
          <strong>{draftSummary ? `Plan V${draftSummary.versionNumber}` : "No draft"}</strong>
          <span>
            {draftPlan
              ? `${draftItems.length} package items · revision ${draftPlan.revision}`
              : "Published plans stay immutable until a successor draft is created."}
          </span>
        </article>
        <article className={styles.statusCard}>
          <small>ACTIVATION POLICY</small>
          <strong>
            {draftPlan
              ? enumLabel(draftPlan.activationTrigger)
              : livePlan
                ? enumLabel(livePlan.activationTrigger)
                : "Not configured"}
          </strong>
          <span>Configure manual/automatic lifecycle policy in Advanced controls.</span>
        </article>
      </section>

      {livePlan ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <small>DATABASE READBACK</small>
              <h2>Current published catalogue</h2>
            </div>
            <span>Immutable published terms</span>
          </div>
          <div className={styles.cards}>
            {liveItems.map((item) => (
              <article className={styles.packageCard} key={item.id}>
                <small>{item.packageCode}</small>
                <strong>{item.displayName}</strong>
                <span>
                  {investmentRangeLabel(item)} {item.currency}
                </span>
                <span>{item.durationDays} days</span>
                <span>{rewardRateLabel(item)}</span>
                <em>{principalReturnLabel(item)}</em>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!draftPlan ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <small>SUCCESSOR VERSION</small>
              <h2>Create an editable draft</h2>
            </div>
          </div>

          {!sourceForClone ? (
            <p className={styles.note}>
              No published source plan exists. The initial catalogue must be
              established through the approved database bootstrap/migration
              path before Admin versioning can begin.
            </p>
          ) : !canManage ? (
            <p className={styles.note}>
              packages.draft.manage permission is required to create a draft.
            </p>
          ) : (
            <div className={styles.actionBox}>
              <label className={styles.field}>
                <span>Audit reason</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={cloneReason}
                  onChange={(event) => setCloneReason(event.target.value)}
                  placeholder="Why is a successor package version required?"
                />
              </label>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy !== "" || cloneReason.trim().length < 3}
                onClick={() => void createDraft()}
              >
                {busy === "clone" ? "Creating…" : "Create successor draft"}
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <small>EDITABLE MYSQL CATALOGUE</small>
              <h2>Draft package items</h2>
            </div>
            {canManage ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  setCreatingItem(true);
                  setSelectedItemId("");
                  setError("");
                  setSuccess("");
                }}
              >
                Add package
              </button>
            ) : null}
          </div>

          {draftItems.length > 0 ? (
            <div className={styles.workspace}>
              <aside className={styles.itemList}>
                {draftItems.map((item) => (
                  <button
                    type="button"
                    className={`${styles.itemButton} ${
                      !creatingItem && selectedItem?.id === item.id
                        ? styles.itemButtonActive
                        : ""
                    }`}
                    onClick={() => {
                      setCreatingItem(false);
                      setSelectedItemId(item.id);
                      setError("");
                      setSuccess("");
                    }}
                    key={item.id}
                  >
                    <small>{item.packageCode}</small>
                    <strong>{item.displayName}</strong>
                    <span>
                      {investmentRangeLabel(item)} {item.currency}
                    </span>
                  </button>
                ))}
              </aside>

              <main className={styles.editorPanel}>
                {creatingItem && canManage ? (
                  <PackageItemEditor
                    plan={draftPlan}
                    item={null}
                    mode="create"
                    onSaved={reload}
                    onCancel={() => {
                      setCreatingItem(false);
                      setSelectedItemId(draftItems[0]?.id ?? "");
                    }}
                  />
                ) : selectedItem && canManage ? (
                  <PackageItemEditor
                    plan={draftPlan}
                    item={selectedItem}
                    mode="edit"
                    onSaved={reload}
                  />
                ) : selectedItem ? (
                  <div className={styles.readOnly}>
                    <h3>{selectedItem.displayName}</h3>
                    <p>Draft editing requires packages.draft.manage permission.</p>
                  </div>
                ) : null}
              </main>
            </div>
          ) : creatingItem && canManage ? (
            <PackageItemEditor
              plan={draftPlan}
              item={null}
              mode="create"
              onSaved={reload}
              onCancel={() => setCreatingItem(false)}
            />
          ) : (
            <div className={styles.empty}>
              <strong>This draft has no package items.</strong>
              <p>Use Add package to create the first DB-backed package configuration.</p>
            </div>
          )}

          <div className={styles.releaseNote}>
            <strong>Publication is separate from editing.</strong>
            <span>
              Review lifecycle settings and publish the complete draft from
              Advanced controls. No package profile is auto-applied by the UI.
            </span>
            <Link href="/packages/advanced">Open Advanced controls</Link>
          </div>
        </section>
      )}
    </div>
  );
}
