"use client";

import { useEffect, useMemo, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type {
  CommissionLevelRule,
  CommissionPackageDepthRule,
  CommissionPackageOption,
  CommissionPlan,
} from "@/lib/commissions";
import styles from "./commission-expansion.module.css";

interface ApiError {
  message?: string | string[];
}

interface PlanListResponse {
  plans: CommissionPlan[];
}

interface PackageListResponse {
  packages: CommissionPackageOption[];
}

function apiMessage(payload: ApiError, fallback: string) {
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

function compactRate(value: string) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizedPackageName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function approvedRate(level: number) {
  if (level === 1) return "10";
  if (level === 2) return "4";
  if (level === 3) return "3";
  if (level === 4) return "2";
  if (level === 5) return "1";
  if (level <= 10) return "0.5";
  if (level <= 20) return "1";
  if (level <= 30) return "1.5";
  if (level <= 40) return "2";
  return "3";
}

function approvedDepth(option: CommissionPackageOption) {
  const name = normalizedPackageName(
    `${option.packageCode}${option.displayName}`,
  );
  if (name.includes("CRYPTOBOT")) return 5;
  if (name.includes("DYNAMOBOT")) return 5;
  if (name.includes("ELITEBOT")) return 10;
  if (name.includes("JUPITERBOT")) return 20;
  if (name.includes("LEGENDBOT")) return 30;
  if (name.includes("NOVABOT")) return 40;
  if (name.includes("PRIMEBOT")) return 50;
  return null;
}

function normalizeLevels(levels: CommissionLevelRule[], maxLevels: number) {
  const byLevel = new Map(levels.map((level) => [level.level, level]));
  return Array.from({ length: maxLevels }, (_, index) => {
    const levelNumber = index + 1;
    const existing = byLevel.get(levelNumber);
    return existing
      ? { ...existing }
      : {
          level: levelNumber,
          enabled: true,
          ratePercent: "1",
          packageMatchingEnabled: true,
        };
  });
}

function depthPayload(rule: CommissionPackageDepthRule) {
  return {
    packageDefinitionId: rule.packageDefinitionId,
    enabled: rule.enabled,
    maxLevelDepth: rule.maxLevelDepth,
  };
}

export default function CommissionExpansionClient() {
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [packages, setPackages] = useState<CommissionPackageOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [maxLevels, setMaxLevels] = useState(5);
  const [levels, setLevels] = useState<CommissionLevelRule[]>([]);
  const [packageDepths, setPackageDepths] = useState<
    CommissionPackageDepthRule[]
  >([]);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(5);
  const [rangeRate, setRangeRate] = useState("1");
  const [rangeEnabled, setRangeEnabled] = useState(true);
  const [rangeMatching, setRangeMatching] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );
  const editable = selectedPlan?.status === "DRAFT" && canManage;

  const sourceSnapshot = useMemo(() => {
    if (!selectedPlan) return "";
    return JSON.stringify({
      maxLevels: selectedPlan.maxLevels,
      levels: normalizeLevels(selectedPlan.levels, selectedPlan.maxLevels).map(
        (level) => ({
          level: level.level,
          enabled: level.enabled,
          ratePercent: compactRate(level.ratePercent),
          packageMatchingEnabled: level.packageMatchingEnabled,
        }),
      ),
      packageDepths: selectedPlan.packageDepths
        .map(depthPayload)
        .sort((a, b) =>
          a.packageDefinitionId.localeCompare(b.packageDefinitionId),
        ),
    });
  }, [selectedPlan]);

  const workingSnapshot = useMemo(
    () =>
      JSON.stringify({
        maxLevels,
        levels: normalizeLevels(levels, maxLevels).map((level) => ({
          level: level.level,
          enabled: level.enabled,
          ratePercent: compactRate(level.ratePercent),
          packageMatchingEnabled: level.packageMatchingEnabled,
        })),
        packageDepths: packageDepths
          .map(depthPayload)
          .sort((a, b) =>
            a.packageDefinitionId.localeCompare(b.packageDefinitionId),
          ),
      }),
    [levels, maxLevels, packageDepths],
  );

  const dirty = Boolean(selectedPlan) && sourceSnapshot !== workingSnapshot;

  function applyPlan(plan: CommissionPlan | null) {
    if (!plan) {
      setSelectedPlanId("");
      setMaxLevels(5);
      setLevels([]);
      setPackageDepths([]);
      return;
    }
    const nextMax = Math.max(1, plan.maxLevels || plan.levels.length || 5);
    setSelectedPlanId(plan.id);
    setMaxLevels(nextMax);
    setLevels(normalizeLevels(plan.levels, nextMax));
    setPackageDepths(plan.packageDepths.map((rule) => ({ ...rule })));
    setRangeTo(Math.min(5, nextMax));
  }

  async function load(preferredPlanId?: string) {
    setError(null);
    const [planResponse, packageResponse] = await Promise.all([
      fetch("/api/admin/commission-plans", { cache: "no-store" }),
      fetch("/api/admin/commission-plans/packages", { cache: "no-store" }),
    ]);
    const planPayload = (await planResponse.json().catch(() => ({}))) as
      | PlanListResponse
      | ApiError;
    const packagePayload = (await packageResponse.json().catch(() => ({}))) as
      | PackageListResponse
      | ApiError;
    if (!planResponse.ok) {
      throw new Error(
        apiMessage(planPayload as ApiError, "Unable to load commission plans."),
      );
    }
    if (!packageResponse.ok) {
      throw new Error(
        apiMessage(
          packagePayload as ApiError,
          "Unable to load package depth options.",
        ),
      );
    }

    const nextPlans = (planPayload as PlanListResponse).plans ?? [];
    const nextPackages = (packagePayload as PackageListResponse).packages ?? [];
    setPlans(nextPlans);
    setPackages(nextPackages);

    const preferred = preferredPlanId
      ? nextPlans.find((plan) => plan.id === preferredPlanId)
      : null;
    const current = selectedPlanId
      ? nextPlans.find((plan) => plan.id === selectedPlanId)
      : null;
    const draft = nextPlans.find((plan) => plan.status === "DRAFT") ?? null;
    applyPlan(preferred ?? current ?? draft ?? nextPlans[0] ?? null);
  }

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
        await load();
      } catch (caught) {
        if (!mounted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load expanded referral commission policy.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void initialize();
    return () => {
      mounted = false;
    };
    // Initial load only; subsequent reloads are explicit after writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resizeLevels(nextValue: number) {
    const nextMax = Math.max(5, Math.min(100, Math.trunc(nextValue || 5)));
    setMaxLevels(nextMax);
    setLevels((current) => normalizeLevels(current, nextMax));
    setPackageDepths((current) =>
      current.map((rule) => ({
        ...rule,
        maxLevelDepth: Math.min(rule.maxLevelDepth, nextMax),
      })),
    );
    setRangeFrom((value) => Math.min(value, nextMax));
    setRangeTo((value) => Math.min(value, nextMax));
  }

  function applyRange() {
    const from = Math.max(1, Math.min(maxLevels, Math.trunc(rangeFrom)));
    const to = Math.max(from, Math.min(maxLevels, Math.trunc(rangeTo)));
    const rate = Number(rangeRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setError("Range rate must be greater than 0 and at most 100 percent.");
      return;
    }
    setLevels((current) =>
      normalizeLevels(current, maxLevels).map((level) =>
        level.level >= from && level.level <= to
          ? {
              ...level,
              enabled: rangeEnabled,
              ratePercent: rangeRate,
              packageMatchingEnabled: rangeMatching,
            }
          : level,
      ),
    );
    setSuccess(`Applied ${rangeRate}% to L${from}–L${to} in this draft.`);
    setError(null);
  }

  function applyApprovedReference() {
    const nextLevels = Array.from({ length: 50 }, (_, index) => ({
      level: index + 1,
      enabled: true,
      ratePercent: approvedRate(index + 1),
      packageMatchingEnabled: true,
    }));
    const nextDepths = packages.flatMap((option) => {
      const maxLevelDepth = approvedDepth(option);
      if (maxLevelDepth === null) return [];
      return [
        {
          packageDefinitionId: option.packageDefinitionId,
          packageCode: option.packageCode,
          packageDisplayName: option.displayName,
          enabled: true,
          maxLevelDepth,
        },
      ];
    });
    setMaxLevels(50);
    setLevels(nextLevels);
    setPackageDepths(nextDepths);
    setRangeFrom(1);
    setRangeTo(5);
    setRangeRate("1");
    setSuccess(
      `Approved 50-level reference loaded into the draft (${nextDepths.length} available package depth rule(s)). Save before publishing.`,
    );
    setError(null);
  }

  function updatePackageDepth(
    option: CommissionPackageOption,
    enabled: boolean,
    depth?: number,
  ) {
    setPackageDepths((current) => {
      const existing = current.find(
        (rule) => rule.packageDefinitionId === option.packageDefinitionId,
      );
      if (!enabled) {
        return current.filter(
          (rule) => rule.packageDefinitionId !== option.packageDefinitionId,
        );
      }
      const nextDepth = Math.max(
        5,
        Math.min(maxLevels, Math.trunc(depth ?? existing?.maxLevelDepth ?? 5)),
      );
      const nextRule: CommissionPackageDepthRule = {
        id: existing?.id,
        packageDefinitionId: option.packageDefinitionId,
        packageCode: option.packageCode,
        packageDisplayName: option.displayName,
        enabled: true,
        maxLevelDepth: nextDepth,
      };
      return existing
        ? current.map((rule) =>
            rule.packageDefinitionId === option.packageDefinitionId
              ? nextRule
              : rule,
          )
        : [...current, nextRule];
    });
  }

  async function cloneSelected() {
    if (!selectedPlan || selectedPlan.status !== "PUBLISHED") return;
    setBusy("clone");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/commission-plans/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanVersionId: selectedPlan.id,
          reason: "Create configurable expanded referral commission draft.",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Unable to clone commission draft."),
        );
      }
      const created = payload as CommissionPlan;
      await load(created.id);
      setSuccess(`Commission plan V${created.versionNumber} draft created.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to clone commission draft.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!selectedPlan || !editable) return;
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      const normalized = normalizeLevels(levels, maxLevels);
      const body: Record<string, unknown> = {
        expectedRevision: selectedPlan.revision,
        reason: "Update configurable level rates and package depth eligibility.",
        levels: normalized.map((level) => ({
          level: level.level,
          enabled: level.enabled,
          ratePercent: level.ratePercent,
          packageMatchingEnabled: level.packageMatchingEnabled,
        })),
      };
      if (packageDepths.length > 0) {
        body.packageDepths = packageDepths.map(depthPayload);
      }
      const response = await fetch(
        `/api/admin/commission-plans/${encodeURIComponent(selectedPlan.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Unable to save expanded policy."),
        );
      }
      const saved = payload as CommissionPlan;
      await load(saved.id);
      setSuccess(`Commission plan V${saved.versionNumber} expanded draft saved.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save expanded referral commission policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    if (!selectedPlan || selectedPlan.status !== "DRAFT" || dirty) return;
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
            reason: "Publish approved expanded referral commission policy.",
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | CommissionPlan
        | ApiError;
      if (!response.ok) {
        throw new Error(
          apiMessage(payload as ApiError, "Unable to publish expanded policy."),
        );
      }
      const published = payload as CommissionPlan;
      await load(published.id);
      setSuccess(`Commission plan V${published.versionNumber} published.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish expanded referral commission policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <section className={styles.card}>Loading expanded policy…</section>;
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <span>COMM-02 · EXPANDED REFERRAL COMMISSION</span>
          <h2>Configurable level rates & package depth</h2>
          <p>
            Same Referral Commissions engine. Published V1 stays immutable;
            future versions can extend genealogy depth while package matching
            remains min(upline package basis, downline package value).
          </p>
        </div>
        <div className={styles.actions}>
          <select
            value={selectedPlanId}
            onChange={(event) => {
              const next = plans.find((plan) => plan.id === event.target.value);
              applyPlan(next ?? null);
              setError(null);
              setSuccess(null);
            }}
            disabled={dirty || busy !== null}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                V{plan.versionNumber} · {plan.status}
              </option>
            ))}
          </select>
          {selectedPlan?.status === "PUBLISHED" && canManage ? (
            <button type="button" onClick={() => void cloneSelected()} disabled={busy !== null}>
              {busy === "clone" ? "Cloning…" : "Clone new draft"}
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={applyApprovedReference}
              disabled={busy !== null}
            >
              Load approved 50-level reference
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={busy !== null || !dirty}
            >
              {busy === "save" ? "Saving…" : "Save expanded draft"}
            </button>
          ) : null}
          {selectedPlan?.status === "DRAFT" && isSuperAdmin ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => void publishDraft()}
              disabled={busy !== null || dirty}
            >
              {dirty
                ? "Save before publishing"
                : busy === "publish"
                  ? "Publishing…"
                  : "Publish plan"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.flashStack}>
        {error ? (
          <FlashMessage type="error" message={error} onClose={() => setError(null)} />
        ) : null}
        {success ? (
          <FlashMessage
            type="success"
            message={success}
            onClose={() => setSuccess(null)}
          />
        ) : null}
        {dirty ? (
          <div className={styles.unsaved}>UNSAVED EXPANDED COMMISSION CHANGES</div>
        ) : null}
      </div>

      {!selectedPlan ? (
        <div className={styles.empty}>No referral commission plan available.</div>
      ) : (
        <>
          <div className={styles.summaryGrid}>
            <div>
              <small>PLAN</small>
              <strong>V{selectedPlan.versionNumber} · {selectedPlan.status}</strong>
            </div>
            <label>
              <small>NUMBER OF LEVELS</small>
              <input
                type="number"
                min={5}
                max={100}
                value={maxLevels}
                disabled={!editable}
                onChange={(event) => resizeLevels(Number(event.target.value))}
              />
            </label>
            <div>
              <small>PACKAGE DEPTH RULES</small>
              <strong>{packageDepths.length}</strong>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <div>
                <span>LEVEL / RANGE CONFIGURATION</span>
                <h3>Apply commission rates by genealogy range</h3>
              </div>
              <p>Changes remain draft-only until SUPER_ADMIN publication.</p>
            </div>
            <div className={styles.rangeEditor}>
              <label>
                From
                <input
                  type="number"
                  min={1}
                  max={maxLevels}
                  value={rangeFrom}
                  disabled={!editable}
                  onChange={(event) => setRangeFrom(Number(event.target.value))}
                />
              </label>
              <label>
                To
                <input
                  type="number"
                  min={1}
                  max={maxLevels}
                  value={rangeTo}
                  disabled={!editable}
                  onChange={(event) => setRangeTo(Number(event.target.value))}
                />
              </label>
              <label>
                Rate %
                <input
                  type="text"
                  value={rangeRate}
                  disabled={!editable}
                  onChange={(event) => setRangeRate(event.target.value)}
                />
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={rangeEnabled}
                  disabled={!editable}
                  onChange={(event) => setRangeEnabled(event.target.checked)}
                />
                Enabled
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={rangeMatching}
                  disabled={!editable}
                  onChange={(event) => setRangeMatching(event.target.checked)}
                />
                Package matching
              </label>
              <button type="button" onClick={applyRange} disabled={!editable}>
                Apply range
              </button>
            </div>

            <div className={styles.levelGrid}>
              {normalizeLevels(levels, maxLevels).map((level) => (
                <div className={styles.levelChip} key={level.level}>
                  <strong>L{level.level}</strong>
                  <span>{compactRate(level.ratePercent)}%</span>
                  <small>
                    {level.enabled ? "ON" : "OFF"} · {level.packageMatchingEnabled ? "MATCH" : "FULL BASE"}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <div>
                <span>PACKAGE LEVEL UNLOCK</span>
                <h3>Highest qualifying ACTIVE package controls depth</h3>
              </div>
              <p>L1–L5 is the minimum enabled package depth.</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Use for depth</th>
                    <th>Unlock through level</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((option) => {
                    const rule = packageDepths.find(
                      (item) =>
                        item.packageDefinitionId === option.packageDefinitionId,
                    );
                    return (
                      <tr key={option.packageDefinitionId}>
                        <td>
                          <strong>{option.displayName}</strong>
                          <small>{option.packageCode}</small>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(rule)}
                            disabled={!editable}
                            onChange={(event) =>
                              updatePackageDepth(option, event.target.checked)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={5}
                            max={maxLevels}
                            value={rule?.maxLevelDepth ?? 5}
                            disabled={!editable || !rule}
                            onChange={(event) =>
                              updatePackageDepth(
                                option,
                                true,
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
