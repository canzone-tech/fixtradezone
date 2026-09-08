"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlashMessage from "@/components/ui/flash-message";
import { resolveAdminSession } from "@/lib/admin-session-client";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";
import styles from "./award-rewards.module.css";

type PolicyStatus = "DRAFT" | "PUBLISHED";
type UserTrackStatus =
  | "ACTIVE_TRACK"
  | "QUALIFIED"
  | "AWARD_POSTED"
  | "CLOSED";

interface ApiMessage {
  message?: string | string[];
}

interface PolicySummary {
  id: string;
  versionNumber: number;
  status: PolicyStatus;
  revision: number;
  enabled: boolean;
  levelCount: number;
  asset: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  clonedFromPolicyVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PolicyTrack {
  id: string;
  packageDefinitionId: string;
  packageCode: string;
  packageDisplayName: string;
  trackOrder: number;
  awardAmount: string;
  levels: Array<{
    levelNumber: number;
    requiredBusiness: string | null;
    required: boolean;
  }>;
}

interface PolicyDetail extends PolicySummary {
  tracks: PolicyTrack[];
}

interface PackageOption {
  packageDefinitionId: string;
  packageCode: string;
  displayName: string;
  sortOrder: number;
}

interface TrackDraft {
  packageDefinitionId: string;
  trackOrder: number;
  awardAmount: string;
  levels: string[];
}

interface PolicyDraft {
  enabled: boolean;
  levelCount: number;
  asset: string;
  tracks: TrackDraft[];
}

interface AdminUserTrack {
  id: string;
  userId: string;
  username?: string;
  email?: string | null;
  packageCode: string;
  packageDisplayName: string;
  trackOrder: number;
  awardAmount: string;
  currency: string;
  levelCount: number;
  status: UserTrackStatus;
  startedAt: string;
  qualifiedAt: string | null;
  awardPostedAt: string | null;
  closedAt: string | null;
  ledgerTransactionId: string | null;
}

interface AwardEvent {
  id: string;
  userId: string;
  username?: string;
  email?: string | null;
  packageCode: string;
  packageDisplayName: string;
  awardAmount: string;
  currency: string;
  ledgerTransactionId: string;
  postedAt: string;
}

interface PolicyListResponse {
  policies: PolicySummary[];
}

interface PackageListResponse {
  packages: PackageOption[];
}

interface TrackListResponse {
  tracks: AdminUserTrack[];
  total: number;
}

interface EventListResponse {
  events: AwardEvent[];
  total: number;
}

interface UsersResponse {
  users: AdminUser[];
}

interface ReconcileResponse {
  usersProcessed: number;
  startedTracks: number;
  awardsPosted: number;
  closedTracks: number;
}

function messageFrom(payload: ApiMessage | null, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message[0] ?? fallback;
  return fallback;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & ApiMessage)
    | null;
  if (!response.ok || !payload) {
    throw new Error(messageFrom(payload, fallback));
  }
  return payload;
}

function compactDecimal(value: string) {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function amount(value: string, currency: string) {
  return `${compactDecimal(value)} ${currency}`;
}

function userLabel(user: AdminUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const details = [name, user.email].filter(Boolean).join(" · ");
  return `@${user.username}${details ? ` · ${details}` : ""}`;
}

function policyToDraft(policy: PolicyDetail): PolicyDraft {
  return {
    enabled: policy.enabled,
    levelCount: policy.levelCount,
    asset: policy.asset,
    tracks: policy.tracks.map((track) => ({
      packageDefinitionId: track.packageDefinitionId,
      trackOrder: track.trackOrder,
      awardAmount: compactDecimal(track.awardAmount),
      levels: Array.from({ length: policy.levelCount }, (_, index) => {
        const level = track.levels.find(
          (candidate) => candidate.levelNumber === index + 1,
        );
        return level?.requiredBusiness
          ? compactDecimal(level.requiredBusiness)
          : "";
      }),
    })),
  };
}

function statusTone(status: UserTrackStatus) {
  if (status === "CLOSED" || status === "AWARD_POSTED") return "success";
  if (status === "QUALIFIED") return "warning";
  return undefined;
}

export default function AwardRewardsClient() {
  const selectedPolicyIdRef = useRef("");
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [tracks, setTracks] = useState<AdminUserTrack[]>([]);
  const [events, setEvents] = useState<AwardEvent[]>([]);
  const [reconcileUsers, setReconcileUsers] = useState<AdminUser[]>([]);
  const [reason, setReason] = useState(
    "Reviewed Team Business Awards policy update.",
  );
  const [reconcileUserId, setReconcileUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canReconcile, setCanReconcile] = useState(false);

  const dirty = useMemo(() => {
    if (!policy || !draft || policy.status !== "DRAFT") return false;
    return JSON.stringify(draft) !== JSON.stringify(policyToDraft(policy));
  }, [draft, policy]);

  const loadPolicy = useCallback(async (policyVersionId: string) => {
    if (!policyVersionId) {
      selectedPolicyIdRef.current = "";
      setPolicy(null);
      setDraft(null);
      return;
    }

    const response = await fetch(
      `/api/admin/award-reward-policies/${encodeURIComponent(policyVersionId)}`,
      { cache: "no-store" },
    );
    const detail = await readJson<PolicyDetail>(
      response,
      "Unable to load Team Business Awards policy.",
    );
    selectedPolicyIdRef.current = detail.id;
    setPolicy(detail);
    setDraft(policyToDraft(detail));
  }, []);

  const loadWorkspace = useCallback(async () => {
    const [policyRes, packageRes, trackRes, eventRes] = await Promise.all([
      fetch("/api/admin/award-reward-policies", { cache: "no-store" }),
      fetch("/api/admin/award-reward-policies/packages", { cache: "no-store" }),
      fetch("/api/admin/award-rewards/tracks?page=1&limit=100", {
        cache: "no-store",
      }),
      fetch("/api/admin/award-rewards/events?page=1&limit=100", {
        cache: "no-store",
      }),
    ]);

    const policyBody = await readJson<PolicyListResponse>(
      policyRes,
      "Unable to load Team Business Awards policies.",
    );
    const packageBody = await readJson<PackageListResponse>(
      packageRes,
      "Unable to load published package options.",
    );
    const trackBody = await readJson<TrackListResponse>(
      trackRes,
      "Unable to load Team Business Awards tracks.",
    );
    const eventBody = await readJson<EventListResponse>(
      eventRes,
      "Unable to load Team Business Awards events.",
    );

    setPolicies(policyBody.policies ?? []);
    setPackages(packageBody.packages ?? []);
    setTracks(trackBody.tracks ?? []);
    setEvents(eventBody.events ?? []);

    const preferred =
      policyBody.policies.find(
        (candidate) => candidate.id === selectedPolicyIdRef.current,
      ) ??
      policyBody.policies[0] ??
      null;
    await loadPolicy(preferred?.id ?? "");
  }, [loadPolicy]);

  const loadReconcileUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users?page=1&limit=100", {
      cache: "no-store",
    });

    if (!response.ok) {
      setReconcileUsers([]);
      return;
    }

    const body = await readJson<UsersResponse>(
      response,
      "Unable to load users for targeted reconciliation.",
    );

    setReconcileUsers(
      (body.users ?? []).filter(
        (user) =>
          user.status === "ACTIVE" &&
          user.roles.includes("USER") &&
          !user.roles.includes("ADMIN") &&
          !user.roles.includes("SUPER_ADMIN"),
      ),
    );
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const session = await resolveAdminSession();
        if (!mounted) return;
        const superAdmin = session.user?.roles.includes("SUPER_ADMIN") ?? false;
        const permissions = session.user?.permissions ?? [];
        const reconcileAllowed =
          superAdmin || permissions.includes("award_rewards.reconcile");
        const canReadUsers = superAdmin || permissions.includes("users.read");

        setIsSuperAdmin(superAdmin);
        setCanReconcile(reconcileAllowed);

        await Promise.all([
          loadWorkspace(),
          reconcileAllowed && canReadUsers
            ? loadReconcileUsers()
            : Promise.resolve(),
        ]);
      } catch (caught) {
        if (!mounted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Team Business Awards workspace.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initialize();
    return () => {
      mounted = false;
    };
  }, [loadReconcileUsers, loadWorkspace]);

  async function selectPolicy(policyVersionId: string) {
    if (dirty) {
      setError(
        "Save or discard the current Team Business Awards draft changes first.",
      );
      return;
    }
    setBusy("select");
    setError("");
    try {
      await loadPolicy(policyVersionId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  function resizeLevels(levelCount: number) {
    if (!draft) return;
    const nextLevelCount = Math.max(1, Math.trunc(levelCount || 1));
    setDraft({
      ...draft,
      levelCount: nextLevelCount,
      tracks: draft.tracks.map((track) => ({
        ...track,
        levels: Array.from(
          { length: nextLevelCount },
          (_, index) => track.levels[index] ?? "",
        ),
      })),
    });
  }

  function updateTrack(index: number, patch: Partial<TrackDraft>) {
    if (!draft) return;
    setDraft({
      ...draft,
      tracks: draft.tracks.map((track, trackIndex) =>
        trackIndex === index ? { ...track, ...patch } : track,
      ),
    });
  }

  function updateLevel(trackIndex: number, levelIndex: number, value: string) {
    if (!draft) return;
    const track = draft.tracks[trackIndex];
    if (!track) return;
    const levels = [...track.levels];
    levels[levelIndex] = value;
    updateTrack(trackIndex, { levels });
  }

  function addTrack() {
    if (!draft) return;
    const used = new Set(
      draft.tracks.map((track) => track.packageDefinitionId),
    );
    const nextPackage = packages.find(
      (candidate) => !used.has(candidate.packageDefinitionId),
    );
    if (!nextPackage) {
      setError("All published package definitions are already in this matrix.");
      return;
    }
    const nextOrder =
      draft.tracks.reduce(
        (highest, track) => Math.max(highest, track.trackOrder),
        0,
      ) + 1;
    setDraft({
      ...draft,
      tracks: [
        ...draft.tracks,
        {
          packageDefinitionId: nextPackage.packageDefinitionId,
          trackOrder: nextOrder,
          awardAmount: "",
          levels: Array.from({ length: draft.levelCount }, () => ""),
        },
      ],
    });
  }

  function removeTrack(index: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      tracks: draft.tracks.filter((_, trackIndex) => trackIndex !== index),
    });
  }

  async function createDraft(sourcePolicyVersionId?: string) {
    if (!isSuperAdmin) return;
    if (reason.trim().length < 3) {
      setError("An audit reason of at least 3 characters is required.");
      return;
    }
    setBusy(sourcePolicyVersionId ? "clone" : "create");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/award-reward-policies/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(sourcePolicyVersionId ? { sourcePolicyVersionId } : {}),
          reason: reason.trim(),
        }),
      });
      const created = await readJson<PolicyDetail>(
        response,
        "Unable to create Team Business Awards policy draft.",
      );
      selectedPolicyIdRef.current = created.id;
      setSuccess(
        `Team Business Awards policy V${created.versionNumber} draft created.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create Team Business Awards policy draft.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!policy || !draft || policy.status !== "DRAFT" || !isSuperAdmin) {
      return;
    }
    if (reason.trim().length < 3) {
      setError("An audit reason of at least 3 characters is required.");
      return;
    }

    setBusy("save");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/award-reward-policies/${encodeURIComponent(policy.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: policy.revision,
            reason: reason.trim(),
            enabled: draft.enabled,
            levelCount: draft.levelCount,
            asset: draft.asset.trim().toUpperCase(),
            tracks: draft.tracks.map((track) => ({
              packageDefinitionId: track.packageDefinitionId,
              trackOrder: track.trackOrder,
              awardAmount: track.awardAmount.trim(),
              levels: track.levels.map((requiredBusiness) => ({
                requiredBusiness: requiredBusiness.trim() || null,
              })),
            })),
          }),
        },
      );
      const saved = await readJson<PolicyDetail>(
        response,
        "Unable to save Team Business Awards policy draft.",
      );
      setPolicy(saved);
      setDraft(policyToDraft(saved));
      setPolicies((current) =>
        current.map((item) =>
          item.id === saved.id
            ? {
                ...item,
                revision: saved.revision,
                enabled: saved.enabled,
                levelCount: saved.levelCount,
                asset: saved.asset,
                updatedAt: saved.updatedAt,
              }
            : item,
        ),
      );
      setSuccess("Team Business Awards matrix draft saved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save Team Business Awards policy draft.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function publishPolicy() {
    if (!policy || policy.status !== "DRAFT" || !isSuperAdmin) return;
    if (dirty) {
      setError("Save the Team Business Awards matrix before publishing.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("An audit reason of at least 3 characters is required.");
      return;
    }

    setBusy("publish");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/award-reward-policies/${encodeURIComponent(policy.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: policy.revision,
            reason: reason.trim(),
          }),
        },
      );
      const published = await readJson<PolicyDetail>(
        response,
        "Unable to publish Team Business Awards policy.",
      );
      selectedPolicyIdRef.current = published.id;
      setSuccess(
        `Team Business Awards policy V${published.versionNumber} published.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish Team Business Awards policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(userId?: string) {
    if (!canReconcile) return;
    setBusy(userId ? "reconcile-selected" : "reconcile-all");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/award-rewards/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userId ? { userId } : {}),
      });
      const result = await readJson<ReconcileResponse>(
        response,
        "Unable to reconcile Team Business Awards progress.",
      );
      setSuccess(
        `Reconciled ${result.usersProcessed} user(s): ${result.startedTracks} track(s) started, ${result.awardsPosted} award(s) posted, ${result.closedTracks} track(s) closed.`,
      );
      await loadWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to reconcile Team Business Awards progress.",
      );
    } finally {
      setBusy(null);
    }
  }

  const selectedSummary = policy
    ? policies.find((candidate) => candidate.id === policy.id) ?? null
    : null;
  const editable = Boolean(
    isSuperAdmin && policy && policy.status === "DRAFT" && draft,
  );

  return (
    <div className={styles.page}>
      {error ? (
        <FlashMessage
          message={error}
          type="error"
          onClose={() => setError("")}
        />
      ) : null}
      {success ? (
        <FlashMessage
          message={success}
          type="success"
          onClose={() => setSuccess("")}
        />
      ) : null}

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AWR-01 / TEAM BUSINESS ACHIEVEMENT</p>
          <h1>Team Business Awards</h1>
          <p>
            Configure a versioned package-by-level Team Business matrix. Each
            user progresses through eligible ACTIVE package tracks sequentially;
            the next package starts from zero only after the previous award has
            posted and closed.
          </p>
        </div>
        <span className={styles.heroBadge}>SEQUENTIAL TRACKS</span>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Policy Matrix</p>
              <h2>
                {policy
                  ? `Team Business Awards Policy V${policy.versionNumber}`
                  : "No Team Business Awards policy yet"}
              </h2>
              {policy ? (
                <p className={styles.muted}>
                  Revision {policy.revision} · {policy.status} · updated {" "}
                  {formatPlatformDateTime(policy.updatedAt)}
                </p>
              ) : null}
            </div>
            {policy ? (
              <span
                className={styles.badge}
                data-tone={
                  policy.status === "PUBLISHED" ? "success" : "warning"
                }
              >
                {policy.status}
              </span>
            ) : null}
          </div>

          {!policy || !draft ? (
            <div className={styles.empty}>
              {loading
                ? "Loading Team Business Awards policy…"
                : "Create the first policy draft to configure package achievement targets."}
            </div>
          ) : (
            <>
              {policy.status === "PUBLISHED" ? (
                <div className={styles.notice}>
                  Published policy terms are immutable. Clone this version to a
                  new draft before changing level count, package order, Team
                  Business thresholds, or award values.
                </div>
              ) : (
                <div className={styles.notice}>
                  Blank level targets are stored as <strong>NOT_REQUIRED</strong>.
                  Team Business is evaluated independently at the exact genealogy
                  level and only from package activations after the active track
                  starts.
                </div>
              )}

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Number of levels</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={draft.levelCount}
                    disabled={!editable}
                    onChange={(event) =>
                      resizeLevels(Number(event.target.value))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Award asset</span>
                  <input
                    className={styles.input}
                    value={draft.asset}
                    disabled={!editable}
                    maxLength={10}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        asset: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Policy status</span>
                  <span className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!editable}
                      onChange={(event) =>
                        setDraft({ ...draft, enabled: event.target.checked })
                      }
                    />
                    Enabled
                  </span>
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Audit reason</span>
                  <input
                    className={styles.input}
                    value={reason}
                    minLength={3}
                    maxLength={500}
                    disabled={!isSuperAdmin}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </div>

              <div className={styles.matrixWrap}>
                <table className={styles.matrix}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Package</th>
                      {Array.from({ length: draft.levelCount }, (_, index) => (
                        <th key={index}>L{index + 1} Team Business</th>
                      ))}
                      <th>Award</th>
                      {editable ? <th>Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.tracks.map((track, trackIndex) => (
                      <tr key={`${track.packageDefinitionId}-${trackIndex}`}>
                        <td>
                          <input
                            className={styles.input}
                            type="number"
                            min={1}
                            value={track.trackOrder}
                            disabled={!editable}
                            onChange={(event) =>
                              updateTrack(trackIndex, {
                                trackOrder: Math.max(
                                  1,
                                  Math.trunc(Number(event.target.value) || 1),
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <select
                            className={`${styles.select} ${styles.packageSelect}`}
                            value={track.packageDefinitionId}
                            disabled={!editable}
                            onChange={(event) =>
                              updateTrack(trackIndex, {
                                packageDefinitionId: event.target.value,
                              })
                            }
                          >
                            {packages.map((option) => (
                              <option
                                key={option.packageDefinitionId}
                                value={option.packageDefinitionId}
                              >
                                {option.displayName} · {option.packageCode}
                              </option>
                            ))}
                          </select>
                        </td>
                        {track.levels.map((value, levelIndex) => (
                          <td key={levelIndex}>
                            <input
                              className={`${styles.input} ${styles.levelInput}`}
                              inputMode="decimal"
                              placeholder="NOT_REQUIRED"
                              value={value}
                              disabled={!editable}
                              onChange={(event) =>
                                updateLevel(
                                  trackIndex,
                                  levelIndex,
                                  event.target.value,
                                )
                              }
                            />
                            {!value ? (
                              <span className={styles.matrixNote}>
                                NOT_REQUIRED
                              </span>
                            ) : null}
                          </td>
                        ))}
                        <td>
                          <input
                            className={styles.input}
                            inputMode="decimal"
                            value={track.awardAmount}
                            disabled={!editable}
                            placeholder="0.00"
                            onChange={(event) =>
                              updateTrack(trackIndex, {
                                awardAmount: event.target.value,
                              })
                            }
                          />
                          <span className={styles.matrixNote}>{draft.asset}</span>
                        </td>
                        {editable ? (
                          <td>
                            <button
                              className={styles.buttonDanger}
                              type="button"
                              onClick={() => removeTrack(trackIndex)}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {draft.tracks.length === 0 ? (
                <div className={styles.empty}>No package tracks configured.</div>
              ) : null}

              <div className={styles.actions}>
                {editable ? (
                  <>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={addTrack}
                    >
                      Add package track
                    </button>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={busy !== null || !dirty}
                      onClick={() => void saveDraft()}
                    >
                      {busy === "save" ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={
                        busy !== null || dirty || draft.tracks.length === 0
                      }
                      onClick={() => void publishPolicy()}
                    >
                      {busy === "publish"
                        ? "Publishing…"
                        : "Publish version"}
                    </button>
                  </>
                ) : null}
                {isSuperAdmin && policy.status === "PUBLISHED" ? (
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void createDraft(policy.id)}
                  >
                    {busy === "clone" ? "Cloning…" : "Clone to new draft"}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>

        <aside className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Versions</p>
              <h3>Policy history</h3>
            </div>
          </div>

          <div className={styles.policyList}>
            {policies.map((item) => (
              <button
                className={styles.policyButton}
                data-active={item.id === policy?.id}
                type="button"
                key={item.id}
                disabled={busy === "select"}
                onClick={() => void selectPolicy(item.id)}
              >
                <span>
                  <strong>V{item.versionNumber}</strong>
                  <span className={styles.meta}>
                    {" "}· {item.levelCount} level(s) · {item.asset}
                  </span>
                </span>
                <span
                  className={styles.badge}
                  data-tone={
                    item.status === "PUBLISHED" ? "success" : "warning"
                  }
                >
                  {item.status}
                </span>
              </button>
            ))}
          </div>

          {policies.length === 0 ? (
            <div className={styles.empty}>No policy versions yet.</div>
          ) : null}

          {isSuperAdmin ? (
            <div className={styles.actions}>
              <button
                className={styles.buttonSecondary}
                type="button"
                disabled={busy !== null}
                onClick={() => void createDraft()}
              >
                {busy === "create" ? "Creating…" : "Create blank draft"}
              </button>
              {selectedSummary ? (
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={
                    busy !== null || selectedSummary.status !== "PUBLISHED"
                  }
                  onClick={() => void createDraft(selectedSummary.id)}
                >
                  Clone selected
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Sequential Processing</p>
            <h2>User Award Tracks</h2>
            <p className={styles.muted}>
              One open package track per user. Later eligible ACTIVE packages
              wait until the previous award posts and closes.
            </p>
          </div>
          {canReconcile ? (
            <div className={styles.actions}>
              {reconcileUsers.length > 0 ? (
                <select
                  className={styles.select}
                  value={reconcileUserId}
                  onChange={(event) => setReconcileUserId(event.target.value)}
                  aria-label="Select USER for Team Business Awards reconciliation"
                >
                  <option value="">Select USER</option>
                  {reconcileUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userLabel(user)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  placeholder="USER UUID"
                  value={reconcileUserId}
                  onChange={(event) => setReconcileUserId(event.target.value)}
                />
              )}
              <button
                className={styles.buttonSecondary}
                type="button"
                disabled={busy !== null || !reconcileUserId}
                onClick={() => void reconcile(reconcileUserId)}
              >
                {busy === "reconcile-selected"
                  ? "Reconciling…"
                  : "Reconcile selected"}
              </button>
              <button
                className={styles.buttonSecondary}
                type="button"
                disabled={busy !== null}
                onClick={() => void reconcile()}
              >
                {busy === "reconcile-all" ? "Reconciling all…" : "Reconcile all"}
              </button>
            </div>
          ) : null}
        </div>

        {tracks.length === 0 ? (
          <div className={styles.empty}>
            No Team Business Awards user tracks yet.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Package</th>
                  <th>Order</th>
                  <th>Award</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => (
                  <tr key={track.id}>
                    <td>
                      <strong>{track.username ?? track.userId}</strong>
                      <div className={styles.meta}>
                        {track.email ?? track.userId}
                      </div>
                    </td>
                    <td>
                      <strong>{track.packageDisplayName}</strong>
                      <div className={styles.meta}>{track.packageCode}</div>
                    </td>
                    <td>{track.trackOrder}</td>
                    <td>{amount(track.awardAmount, track.currency)}</td>
                    <td>
                      <span
                        className={styles.badge}
                        data-tone={statusTone(track.status)}
                      >
                        {track.status}
                      </span>
                    </td>
                    <td>{formatPlatformDateTime(track.startedAt)}</td>
                    <td>{formatPlatformDateTime(track.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Immutable Award History</p>
            <h2>Posted Awards</h2>
          </div>
        </div>

        {events.length === 0 ? (
          <div className={styles.empty}>
            No Team Business Awards events posted yet.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Package</th>
                  <th>Award</th>
                  <th>Posted</th>
                  <th>Ledger Transaction</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.username ?? event.userId}</strong>
                      <div className={styles.meta}>
                        {event.email ?? event.userId}
                      </div>
                    </td>
                    <td>
                      <strong>{event.packageDisplayName}</strong>
                      <div className={styles.meta}>{event.packageCode}</div>
                    </td>
                    <td>{amount(event.awardAmount, event.currency)}</td>
                    <td>{formatPlatformDateTime(event.postedAt)}</td>
                    <td className={styles.meta}>{event.ledgerTransactionId}</td>
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
