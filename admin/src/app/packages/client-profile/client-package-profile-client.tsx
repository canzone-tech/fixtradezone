"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import {
  apiMessage,
  investmentRangeLabel,
  principalReturnLabel,
  readApiPayload,
  type ApiErrorPayload,
  type PackagePlan,
  type PackagePlanSummary,
} from "@/lib/packages";
import styles from "../packages.module.css";

interface PlanListPayload extends ApiErrorPayload {
  planVersions?: PackagePlanSummary[];
}

interface PlanPayload extends ApiErrorPayload {
  plan?: PackagePlan;
}

interface MutationPayload extends ApiErrorPayload {
  message?: string;
  revision?: number;
}

async function loadDraft(): Promise<PackagePlan | null> {
  const listResponse = await fetch("/api/admin/package-plans", {
    cache: "no-store",
  });
  const listPayload = await readApiPayload<PlanListPayload>(listResponse);

  if (!listResponse.ok || !listPayload?.planVersions) {
    throw new Error(apiMessage(listPayload, "Unable to load package plans."));
  }

  const draft = listPayload.planVersions.find((plan) => plan.status === "DRAFT");
  if (!draft) return null;

  const planResponse = await fetch(
    `/api/admin/package-plans/${encodeURIComponent(draft.id)}`,
    { cache: "no-store" },
  );
  const planPayload = await readApiPayload<PlanPayload>(planResponse);

  if (!planResponse.ok || !planPayload?.plan) {
    throw new Error(apiMessage(planPayload, "Unable to load package draft."));
  }

  return planPayload.plan;
}

export default function ClientPackageProfileClient() {
  const router = useRouter();
  const [plan, setPlan] = useState<PackagePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  async function reload() {
    setPlan(await loadDraft());
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

        const isSuperAdmin = session.user.roles.includes("SUPER_ADMIN");
        if (!mounted) return;
        setAuthorized(isSuperAdmin);

        if (!isSuperAdmin) return;
        const draft = await loadDraft();
        if (mounted) setPlan(draft);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load client package profile.",
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
  }, [router]);

  async function applyProfile() {
    if (!plan || reason.trim().length < 3 || busy) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/package-plans/${encodeURIComponent(plan.id)}/client-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: plan.revision,
            reason: reason.trim(),
          }),
        },
      );
      const payload = await readApiPayload<MutationPayload>(response);

      if (response.status === 401 || response.status === 403) {
        if (response.status === 401) router.replace("/login");
        throw new Error(
          apiMessage(payload, "SUPER_ADMIN access is required."),
        );
      }

      if (!response.ok) {
        if (response.status === 409) await reload();
        throw new Error(apiMessage(payload, "Unable to apply client profile."));
      }

      setReason("");
      setSuccess(payload?.message ?? "Locked client package profile applied.");
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to apply client profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading client package profile…</p>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className={styles.errorState}>
        <i className="iconoir-lock" />
        <strong>SUPER_ADMIN access required</strong>
        <p>The locked client package profile changes commercial package terms.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>PKG-02 / CLIENT RANGE PROFILE</span>
          <h2>Package Investment Ranges</h2>
          <p>
            Apply and review the locked nine-package client profile on the
            editable draft only. Published terms remain immutable.
          </p>
        </div>
        <div className={styles.headerBadges}>
          <span className={styles.roleBadge}>SUPER_ADMIN</span>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {success ? <div className={styles.successBanner}>{success}</div> : null}

      {!plan ? (
        <section className={styles.sectionCard}>
          <div className={styles.emptyState}>
            <i className="iconoir-box" />
            <strong>No editable package draft</strong>
            <p>
              Clone the current published plan first, then return here to apply
              the locked range and lifecycle profile.
            </p>
            <Link href="/packages">Open Package Plans</Link>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.metrics}>
            <article>
              <small>DRAFT</small>
              <strong>V{plan.versionNumber}</strong>
            </article>
            <article>
              <small>REVISION</small>
              <strong>{plan.revision}</strong>
            </article>
            <article>
              <small>ACTIVE MODE</small>
              <strong>{plan.activePackageMode}</strong>
            </article>
            <article>
              <small>PACKAGES</small>
              <strong>{plan.items.length}</strong>
            </article>
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div>
                <small>LOCKED CLIENT TERMS</small>
                <h3>Range and lifecycle review</h3>
              </div>
              <span>Actual user investment is snapshotted per activation</span>
            </div>

            <div className={styles.itemGrid}>
              {plan.items.map((item) => (
                <article className={styles.itemCard} key={item.id}>
                  <span className={styles.itemOrder}>
                    {String(item.sortOrder).padStart(2, "0")}
                  </span>
                  <small>{item.packageCode}</small>
                  <strong>{item.displayName}</strong>
                  <b>
                    {investmentRangeLabel(item)} {item.currency}
                  </b>
                  <span>{item.durationDays} days</span>
                  <em>{principalReturnLabel(item)}</em>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div>
                <small>AUDITED DRAFT ACTION</small>
                <h3>Apply locked client profile</h3>
              </div>
              <span>Revision {plan.revision}</span>
            </div>

            <div className={styles.guardrail}>
              <i className="iconoir-shield-check" />
              <div>
                <strong>One operation updates all nine package terms</strong>
                <p>
                  The backend requires exactly the canonical nine package
                  definitions, switches the draft to multiple-active mode,
                  applies the approved ranges/durations and records one audit
                  trail. PrimeBot is configured with no capital return.
                </p>
              </div>
            </div>

            <div className={styles.auditAction}>
              <label className={styles.field}>
                <span>Audit reason</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is the locked client package profile being applied?"
                />
              </label>
              <button
                type="button"
                disabled={busy || reason.trim().length < 3}
                onClick={() => void applyProfile()}
              >
                {busy ? "Applying…" : "Apply locked package profile"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
