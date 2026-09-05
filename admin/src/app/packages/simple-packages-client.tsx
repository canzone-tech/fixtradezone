"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  apiMessage,
  investmentRangeLabel,
  principalReturnLabel,
  readApiPayload,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanSummary,
} from "@/lib/packages";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./simple-packages.module.css";

interface PlanListPayload extends ApiErrorPayload {
  planVersions?: PackagePlanSummary[];
}

interface PlanPayload extends ApiErrorPayload {
  plan?: PackagePlan;
}

interface MutationPayload extends ApiErrorPayload {
  message?: string;
  revision?: number;
  plan?: PackagePlan;
}

const LOCKED_PROFILE = [
  ["FTZ AlphaBotc", "5", "24", 10, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ BullBot", "25", "49", 15, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ CryptoBot", "50", "99", 20, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ DynamoBot", "100", "499", 25, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ EliteBot", "500", "999", 30, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ JupiterBot", "1000", "1999", 60, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ LegendBot", "2000", "3999", 90, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ NovaBot", "4000", "4999", 120, "RETURN_EXACT_INVESTED_PRINCIPAL"],
  ["FTZ PrimeBot", "5000", null, 150, "NO_CAPITAL_RETURN"],
] as const;

function decimalNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesLockedProfile(plan: PackagePlan | null): boolean {
  if (!plan || plan.items.length !== LOCKED_PROFILE.length) return false;
  if (plan.activePackageMode !== "MULTIPLE_ACTIVE") return false;

  const sorted = [...plan.items].sort((left, right) => left.sortOrder - right.sortOrder);
  return LOCKED_PROFILE.every((expected, index) => {
    const item = sorted[index];
    const [name, minimum, maximum, duration, principalReturn] = expected;
    return (
      item?.displayName === name &&
      decimalNumber(item.minimumInvestment) === Number(minimum) &&
      decimalNumber(item.maximumInvestment) ===
        (maximum === null ? null : Number(maximum)) &&
      item.durationDays === duration &&
      item.principalReturn === principalReturn
    );
  });
}

function formatWhen(value: string | null): string {
  if (!value) return "No end date";
  const formatted = formatPlatformDateTime(value);
  return formatted === "—" ? "Not set" : formatted;
}

function currentEffectivePlan(
  plans: PackagePlanSummary[],
): PackagePlanSummary | null {
  const now = Date.now();
  const effective = plans
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
    });

  return effective[0] ?? null;
}

function canManagePackages(user: AdminUser): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") ||
    user.permissions.includes("packages.draft.manage")
  );
}

async function loadPlan(planVersionId: string): Promise<PackagePlan> {
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const liveSummary = useMemo(() => currentEffectivePlan(plans), [plans]);
  const selectedPlan = draftPlan ?? livePlan;
  const draftReady = matchesLockedProfile(draftPlan);
  const isSuperAdmin = actor?.roles.includes("SUPER_ADMIN") ?? false;
  const canManage = actor ? canManagePackages(actor) : false;

  async function reload() {
    const response = await fetch("/api/admin/package-plans", {
      cache: "no-store",
    });
    const payload = await readApiPayload<PlanListPayload>(response);
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (!response.ok || !payload?.planVersions) {
      throw new Error(apiMessage(payload, "Unable to load package plans."));
    }

    const nextPlans = payload.planVersions;
    const nextLiveSummary = currentEffectivePlan(nextPlans);
    const nextDraftSummary =
      nextPlans.find((plan) => plan.status === "DRAFT") ?? null;

    const [nextLive, nextDraft] = await Promise.all([
      nextLiveSummary ? loadPlan(nextLiveSummary.id) : Promise.resolve(null),
      nextDraftSummary ? loadPlan(nextDraftSummary.id) : Promise.resolve(null),
    ]);

    setPlans(nextPlans);
    setLivePlan(nextLive);
    setDraftPlan(nextDraft);
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
        await reload();
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package control.",
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
    // Initial load intentionally resolves the authenticated session first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function createDraft() {
    const source =
      liveSummary ??
      plans
        .filter((plan) => plan.status === "PUBLISHED")
        .sort((left, right) => right.versionNumber - left.versionNumber)[0] ??
      null;

    if (!source || reason.trim().length < 3 || !canManage) return;

    setBusy("clone");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/package-plans/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanVersionId: source.id,
          reason: reason.trim(),
        }),
      });
      const payload = await readApiPayload<MutationPayload>(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Unable to prepare package update."));
      }
      setReason("");
      setSuccess("Package update prepared. Review the approved package setup below.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare package update.");
    } finally {
      setBusy("");
    }
  }

  async function applyApprovedProfile() {
    if (!draftPlan || reason.trim().length < 3 || !isSuperAdmin) return;

    setBusy("profile");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/package-plans/${encodeURIComponent(draftPlan.id)}/client-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draftPlan.revision,
            reason: reason.trim(),
          }),
        },
      );
      const payload = await readApiPayload<MutationPayload>(response);
      if (!response.ok) {
        throw new Error(apiMessage(payload, "Unable to apply approved package setup."));
      }
      setReason("");
      setSuccess("Approved package ranges and durations applied to the draft.");
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to apply approved package setup.",
      );
    } finally {
      setBusy("");
    }
  }

  async function publishGuided() {
    if (
      !draftPlan ||
      !draftReady ||
      reason.trim().length < 3 ||
      !isSuperAdmin
    ) {
      return;
    }

    setBusy("publish");
    setError("");
    setSuccess("");

    const now = Date.now();
    const safeSwitchMs = now + 2 * 60 * 1000;
    const currentEndMs = liveSummary?.effectiveTo
      ? new Date(liveSummary.effectiveTo).getTime()
      : null;
    const transitionMs =
      currentEndMs !== null && currentEndMs > now && currentEndMs < safeSwitchMs
        ? currentEndMs
        : safeSwitchMs;
    const transitionAt = new Date(transitionMs).toISOString();

    const futurePublished = plans.find((plan) => {
      if (plan.status !== "PUBLISHED" || plan.id === liveSummary?.id) return false;
      if (!plan.effectiveFrom) return false;
      return new Date(plan.effectiveFrom).getTime() > transitionMs;
    });

    if (futurePublished) {
      setError(
        `A future published plan (V${futurePublished.versionNumber}) already exists. Use Advanced controls to review the schedule before publishing.`,
      );
      setBusy("");
      return;
    }

    let shortenedLivePlan: PackagePlan | null = null;
    const originalLiveEnd = livePlan?.effectiveTo ?? null;

    try {
      if (
        livePlan &&
        originalLiveEnd !== null &&
        new Date(originalLiveEnd).getTime() > transitionMs + 500
      ) {
        const closeResponse = await fetch(
          `/api/admin/package-plans/${encodeURIComponent(livePlan.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: livePlan.revision,
              reason: reason.trim(),
              effectiveTo: transitionAt,
            }),
          },
        );
        const closePayload = await readApiPayload<MutationPayload>(closeResponse);
        if (!closeResponse.ok || !closePayload?.plan) {
          throw new Error(
            apiMessage(closePayload, "Unable to schedule the live plan handoff."),
          );
        }
        shortenedLivePlan = closePayload.plan;
      }

      const publishResponse = await fetch(
        `/api/admin/package-plans/${encodeURIComponent(draftPlan.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: draftPlan.revision,
            reason: reason.trim(),
            effectiveFrom: transitionAt,
          }),
        },
      );
      const publishPayload = await readApiPayload<MutationPayload>(publishResponse);
      if (!publishResponse.ok) {
        throw new Error(apiMessage(publishPayload, "Unable to publish package plan."));
      }

      setReason("");
      setSuccess(
        `Package plan V${draftPlan.versionNumber} is published and will become live at ${formatWhen(transitionAt)}.`,
      );
      await reload();
    } catch (caught) {
      if (shortenedLivePlan && originalLiveEnd) {
        try {
          await fetch(
            `/api/admin/package-plans/${encodeURIComponent(shortenedLivePlan.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expectedRevision: shortenedLivePlan.revision,
                reason: `Rollback after failed guided publish: ${reason.trim()}`,
                effectiveTo: originalLiveEnd,
              }),
            },
          );
        } catch {
          setError(
            "Publishing failed and the automatic schedule rollback also failed. Open Advanced controls and review the live plan immediately.",
          );
          setBusy("");
          return;
        }
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish package plan.",
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
    return <div className={styles.error}>{error || "Package control is unavailable."}</div>;
  }

  const displayedItems = selectedPlan
    ? [...selectedPlan.items].sort((left, right) => left.sortOrder - right.sortOrder)
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PACKAGE CONTROL</span>
          <h1>Packages</h1>
          <p>
            Daily package management is kept simple here. Version numbers, UTC
            dates and technical lifecycle fields stay in Advanced controls.
          </p>
        </div>
        <Link className={styles.advancedLink} href="/packages/advanced">
          Advanced controls
        </Link>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <section className={styles.statusGrid}>
        <article className={styles.statusCard}>
          <small>LIVE FOR USERS</small>
          <strong className={styles.liveValue}>
            {liveSummary ? `Plan V${liveSummary.versionNumber}` : "No live plan"}
          </strong>
          <span>
            {liveSummary
              ? `Live until ${formatWhen(liveSummary.effectiveTo)}`
              : "Users currently have no effective package catalogue."}
          </span>
        </article>
        <article className={styles.statusCard}>
          <small>NEW PACKAGE UPDATE</small>
          <strong className={draftPlan ? styles.draftValue : undefined}>
            {draftPlan ? `Draft V${draftPlan.versionNumber}` : "Not prepared"}
          </strong>
          <span>
            {draftPlan
              ? draftReady
                ? "Approved ranges and durations are ready."
                : "Draft exists and still needs the approved package setup."
              : "Create a draft only when package terms need to change."}
          </span>
        </article>
        <article className={styles.statusCard}>
          <small>PACKAGE ACTIVATION</small>
          <strong>Automatic</strong>
          <span>
            Approved and accounted payment activates the purchased package. A
            user may keep multiple active packages.
          </span>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <small>{draftPlan ? "DRAFT PREVIEW" : "CURRENT LIVE TERMS"}</small>
            <h2>{draftPlan ? "New package setup" : "Current package setup"}</h2>
            <p>
              These are the commercial terms the client needs to understand:
              investment range, duration and capital return.
            </p>
          </div>
          {draftReady ? <span className={styles.readiness}>READY TO PUBLISH</span> : null}
        </div>

        {displayedItems.length === 0 ? (
          <div className={styles.empty}>No package terms are available.</div>
        ) : (
          <div className={styles.packageGrid}>
            {displayedItems.map((item) => (
              <article className={styles.packageCard} key={item.id}>
                <small>{item.packageCode}</small>
                <strong>{item.displayName}</strong>
                <span className={styles.range}>
                  {item.rangeConfigured
                    ? item.maximumInvestment === null
                      ? `${investmentRangeLabel(item).replace("+", "–Unlimited")} ${item.currency}`
                      : `${investmentRangeLabel(item)} ${item.currency}`
                    : `${investmentRangeLabel(item)} ${item.currency}`}
                </span>
                <div className={styles.meta}>
                  <span>{item.durationDays} days</span>
                  <span
                    className={
                      item.principalReturn === "NO_CAPITAL_RETURN"
                        ? styles.noReturn
                        : styles.principalReturn
                    }
                  >
                    {principalReturnLabel(item)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <small>SIMPLE RULES</small>
            <h2>What the system handles automatically</h2>
          </div>
        </div>
        <div className={styles.explainerGrid}>
          <article className={styles.explainer}>
            <b>Exact investment</b>
            <span>User chooses any allowed amount inside the selected package range.</span>
          </article>
          <article className={styles.explainer}>
            <b>Multiple packages</b>
            <span>Every purchased package remains an independent active subscription.</span>
          </article>
          <article className={styles.explainer}>
            <b>Duration completion</b>
            <span>Each package completes after its configured duration.</span>
          </article>
          <article className={styles.explainer}>
            <b>Capital return</b>
            <span>AlphaBotc through NovaBot return principal; PrimeBot does not.</span>
          </article>
        </div>
      </section>

      <section className={styles.actionCard}>
        <h2>
          {!draftPlan
            ? "Prepare a package update"
            : !draftReady
              ? "Apply approved package setup"
              : "Make this package plan live"}
        </h2>
        <p>
          {!draftPlan
            ? "Use this only when package terms need to change. The current live plan remains untouched while you prepare the update."
            : !draftReady
              ? "One action applies all nine approved investment ranges, durations and capital-return rules."
              : "No UTC or version scheduling is required here. The system creates a short safe handoff window and switches the catalogue automatically."}
        </p>

        {!canManage ? (
          <div className={styles.warning}>
            You can review package terms, but your role does not have permission to change them.
          </div>
        ) : (
          <>
            <label className={styles.reasonField}>
              <span>Reason for this change</span>
              <textarea
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Example: Apply approved client package ranges"
              />
            </label>
            <div className={styles.actions}>
              {!draftPlan ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy !== "" || reason.trim().length < 3}
                  onClick={() => void createDraft()}
                >
                  {busy === "clone" ? "Preparing…" : "Prepare package update"}
                </button>
              ) : !draftReady ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    busy !== "" || reason.trim().length < 3 || !isSuperAdmin
                  }
                  onClick={() => void applyApprovedProfile()}
                >
                  {busy === "profile"
                    ? "Applying…"
                    : "Apply approved package setup"}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    busy !== "" || reason.trim().length < 3 || !isSuperAdmin
                  }
                  onClick={() => void publishGuided()}
                >
                  {busy === "publish" ? "Publishing…" : "Make plan live"}
                </button>
              )}

              <Link className={styles.secondaryButton} href="/packages/advanced">
                Open advanced controls
              </Link>
              <span className={styles.actionHint}>
                Advanced controls are only for custom schedules, historical versions or technical policy changes.
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
