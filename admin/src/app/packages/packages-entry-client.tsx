"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import {
  apiMessage,
  readApiPayload,
  type ApiErrorPayload,
  type PackagePlanSummary,
} from "@/lib/packages";
import SimplePackagesClient from "./simple-packages-client";
import styles from "./simple-packages.module.css";

interface PlanListPayload extends ApiErrorPayload {
  planVersions?: PackagePlanSummary[];
}

interface MutationPayload extends ApiErrorPayload {
  message?: string;
}

function canManagePackages(user: AdminUser): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") ||
    user.permissions.includes("packages.draft.manage")
  );
}

export default function PackagesEntryClient() {
  const router = useRouter();
  const [actor, setActor] = useState<AdminUser | null>(null);
  const [hasPlanHistory, setHasPlanHistory] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

        const response = await fetch("/api/admin/package-plans", {
          cache: "no-store",
        });
        const payload = await readApiPayload<PlanListPayload>(response);

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || !payload?.planVersions) {
          throw new Error(
            apiMessage(payload, "Unable to load package plan versions."),
          );
        }

        if (!mounted) return;
        setActor(session.user);
        setHasPlanHistory(payload.planVersions.length > 0);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package configuration.",
          );
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function createInitialDraft() {
    if (
      !actor ||
      !canManagePackages(actor) ||
      reason.trim().length < 3 ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/package-plans/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const payload = await readApiPayload<MutationPayload>(response);

      if (!response.ok) {
        throw new Error(
          apiMessage(payload, "Unable to create the initial package draft."),
        );
      }

      setHasPlanHistory(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the initial package draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (hasPlanHistory === true) {
    return <SimplePackagesClient />;
  }

  if (hasPlanHistory === null && !error) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading packages…</p>
      </div>
    );
  }

  if (!actor) {
    return <div className={styles.error}>{error || "Package configuration is unavailable."}</div>;
  }

  const canManage = canManagePackages(actor);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PACKAGE CONTROL</span>
          <h1>Packages</h1>
          <p>
            Commercial package terms are stored in the versioned MySQL catalogue.
            No package names, investment ranges, rates or durations are seeded
            from this Admin application.
          </p>
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <small>DATABASE-FIRST BOOTSTRAP</small>
            <h2>Create the initial editable draft</h2>
          </div>
        </div>

        <div className={styles.empty}>
          <strong>No package plan history exists.</strong>
          <p>
            Create an empty V1 draft in MySQL, then add each package through the
            DB-backed editor. Publication remains a separate reviewed action.
          </p>
        </div>

        {!canManage ? (
          <p className={styles.note}>
            packages.draft.manage permission is required to create the initial draft.
          </p>
        ) : (
          <div className={styles.actionBox}>
            <label className={styles.field}>
              <span>Audit reason</span>
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is the initial package catalogue being created?"
              />
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || reason.trim().length < 3}
              onClick={() => void createInitialDraft()}
            >
              {busy ? "Creating…" : "Create initial V1 draft"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
