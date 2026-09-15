"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import {
  formatPlatformDateTime,
  platformIsoToLocalDateTimeInput,
  platformLocalDateTimeToIso,
} from "@/lib/platform-time";
import {
  notifySiteModeChanged,
  type AdminSiteModeStatus,
  type SiteMode,
  type SiteModeTester,
} from "@/lib/site-mode";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "./site-mode-control.module.css";

interface ApiError {
  message?: string | string[];
}

const MODE_OPTIONS: Array<{
  mode: SiteMode;
  title: string;
  description: string;
  consequence: string;
  icon: string;
}> = [
  {
    mode: "LIVE",
    title: "LIVE",
    description: "Public application live with normal account access.",
    consequence: "Operations AUTOMATIC · normal manual recovery locked.",
    icon: "iconoir-flash",
  },
  {
    mode: "TESTING",
    title: "TESTING",
    description: "Pre-launch access for approved testers and SUPER_ADMIN.",
    consequence: "Operations CONTROLLED_MANUAL · automatic processing paused.",
    icon: "iconoir-flask",
  },
  {
    mode: "MAINTENANCE",
    title: "MAINTENANCE",
    description: "Public and normal user access paused for maintenance.",
    consequence: "Operations CONTROLLED_MANUAL · automatic processing paused.",
    icon: "iconoir-tools",
  },
];

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const message = (payload as ApiError).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message[0] ?? fallback;
  return fallback;
}

async function jsonPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export default function OperationsConfigurationClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AdminSiteModeStatus | null>(null);
  const [testers, setTesters] = useState<SiteModeTester[]>([]);
  const [reason, setReason] = useState(
    "Platform mode change approved from SITE-MODE control.",
  );
  const [modeMessage, setModeMessage] = useState("");
  const [launchAt, setLaunchAt] = useState("");
  const [testerIdentifier, setTesterIdentifier] = useState("");
  const [testerNote, setTesterNote] = useState("");
  const [recoveryReason, setRecoveryReason] = useState(
    "Temporary emergency recovery approved by SUPER_ADMIN.",
  );
  const [recoveryMinutes, setRecoveryMinutes] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(
    async (showLoader = false) => {
      if (showLoader) setLoading(true);

      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const session = (await jsonPayload(sessionResponse)) as {
          user?: AdminUser;
        };

        if (!sessionResponse.ok || !session.user) {
          router.replace("/login");
          return;
        }
        if (!session.user.roles.includes("SUPER_ADMIN")) {
          router.replace("/dashboard");
          return;
        }

        const [statusResponse, testersResponse] = await Promise.all([
          fetch("/api/admin/settings/site-mode", { cache: "no-store" }),
          fetch("/api/admin/settings/site-mode/testers", { cache: "no-store" }),
        ]);

        if (statusResponse.status === 401 || testersResponse.status === 401) {
          router.replace("/login");
          return;
        }
        if (statusResponse.status === 403 || testersResponse.status === 403) {
          router.replace("/dashboard");
          return;
        }

        const statusPayload = await jsonPayload(statusResponse);
        const testersPayload = await jsonPayload(testersResponse);

        if (!statusResponse.ok) {
          throw new Error(
            apiErrorMessage(statusPayload, "Unable to load Platform Mode."),
          );
        }
        if (!testersResponse.ok) {
          throw new Error(
            apiErrorMessage(testersPayload, "Unable to load testing access."),
          );
        }

        const nextStatus = statusPayload as AdminSiteModeStatus;
        setStatus(nextStatus);
        setTesters(
          Array.isArray(testersPayload)
            ? (testersPayload as SiteModeTester[])
            : [],
        );
        setModeMessage(nextStatus.modeMessage ?? "");
        setLaunchAt(platformIsoToLocalDateTimeInput(nextStatus.launchAt));
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Platform Mode.",
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const currentOption = useMemo(
    () => MODE_OPTIONS.find((item) => item.mode === status?.siteMode),
    [status?.siteMode],
  );

  async function switchMode(nextMode: SiteMode) {
    if (!status || nextMode === status.siteMode) return;

    const auditReason = reason.trim();
    if (auditReason.length < 3) {
      setError("Enter an audit reason of at least 3 characters.");
      return;
    }

    const publicMessage = modeMessage.trim();
    if (publicMessage && publicMessage.length < 3) {
      setError("Public mode message must be at least 3 characters or blank.");
      return;
    }

    let launchAtIso: string | null = null;
    if (nextMode !== "LIVE" && launchAt.trim()) {
      launchAtIso = platformLocalDateTimeToIso(launchAt);
      if (!launchAtIso) {
        setError("Enter a valid future launch time in platform UTC.");
        return;
      }
    }

    const option = MODE_OPTIONS.find((item) => item.mode === nextMode);
    const confirmed = window.confirm(
      `Switch Platform Mode from ${status.siteMode} to ${nextMode}?\n\n${
        option?.consequence ?? ""
      }`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings/site-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteMode: nextMode,
          reason: auditReason,
          message: publicMessage || null,
          launchAt: nextMode === "LIVE" ? null : launchAtIso,
        }),
      });
      const payload = await jsonPayload(response);

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to change Platform Mode."),
        );
      }

      notifySiteModeChanged();
      setSuccess(
        apiErrorMessage(payload, `Platform Mode changed to ${nextMode}.`),
      );
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to change Platform Mode.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addTester() {
    const identifier = testerIdentifier.trim();
    if (identifier.length < 2) {
      setError("Enter a tester username or email.");
      return;
    }
    const note = testerNote.trim();
    if (note && note.length < 3) {
      setError("Tester note must be at least 3 characters or blank.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings/site-mode/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, note: note || null }),
      });
      const payload = await jsonPayload(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to save testing access."),
        );
      }

      setTesterIdentifier("");
      setTesterNote("");
      setSuccess(apiErrorMessage(payload, "Testing access saved."));
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save testing access.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeTester(tester: SiteModeTester) {
    if (!window.confirm(`Remove testing access for ${tester.username}?`)) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/settings/site-mode/testers/${encodeURIComponent(
          tester.userId,
        )}`,
        { method: "DELETE" },
      );
      const payload = await jsonPayload(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to remove testing access."),
        );
      }

      setSuccess(apiErrorMessage(payload, "Testing access removed."));
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to remove testing access.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlockRecovery() {
    const recoveryAuditReason = recoveryReason.trim();
    const durationMinutes = Number(recoveryMinutes);

    if (recoveryAuditReason.length < 3) {
      setError("Enter an emergency recovery reason.");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 60) {
      setError("Emergency recovery duration must be between 5 and 60 minutes.");
      return;
    }
    if (!window.confirm(`Unlock emergency recovery for ${durationMinutes} minutes?`)) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/admin/settings/site-mode/emergency-recovery/unlock",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: recoveryAuditReason,
            durationMinutes,
          }),
        },
      );
      const payload = await jsonPayload(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to unlock emergency recovery."),
        );
      }

      setSuccess(
        apiErrorMessage(payload, "Emergency recovery temporarily unlocked."),
      );
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to unlock emergency recovery.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function lockRecovery() {
    const recoveryAuditReason = recoveryReason.trim();
    if (recoveryAuditReason.length < 3) {
      setError("Enter an emergency recovery reason.");
      return;
    }
    if (!window.confirm("Lock emergency recovery now?")) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/admin/settings/site-mode/emergency-recovery/lock",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: recoveryAuditReason }),
        },
      );
      const payload = await jsonPayload(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to lock emergency recovery."),
        );
      }

      setSuccess(apiErrorMessage(payload, "Emergency recovery locked."));
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to lock emergency recovery.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className={styles.loading}>Loading Platform Mode…</section>;
  }

  return (
    <section className={styles.page}>
      {error ? <div className={styles.flashError}>{error}</div> : null}
      {success ? <div className={styles.flashSuccess}>{success}</div> : null}

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <i className="iconoir-settings" />
            SUPER ADMIN · SITE-MODE-01
          </div>
          <h2>Platform Mode Control</h2>
          <p>
            One authoritative switch controls public availability and the master
            operations profile. LIVE is automatic; TESTING and MAINTENANCE are
            controlled manual.
          </p>
        </div>
        <div className={styles.statusBadge}>
          <i className={currentOption?.icon ?? "iconoir-settings"} />
          {status?.siteMode ?? "UNKNOWN"} · {status?.operationsMode ?? "—"}
        </div>
      </header>

      <PlatformSettingsNav active="operations" />

      <div className={styles.modeGrid}>
        {MODE_OPTIONS.map((option) => {
          const active = status?.siteMode === option.mode;
          return (
            <article
              key={option.mode}
              className={`${styles.modeCard} ${active ? styles.modeCardActive : ""}`}
            >
              <div className={styles.modeBadge}>
                <i className={option.icon} />
                {option.title}
              </div>
              <h3>{option.description}</h3>
              <p>{option.consequence}</p>
              <button
                type="button"
                disabled={busy || active}
                onClick={() => void switchMode(option.mode)}
              >
                {active ? "Current mode" : `Switch to ${option.title}`}
              </button>
            </article>
          );
        })}
      </div>

      <div className={styles.twoColumn}>
        <article className={styles.card}>
          <div className={styles.sectionEyebrow}>CHANGE CONTEXT</div>
          <h3>Confirmation & public message</h3>
          <p>
            Every mode change is audited. The public message and UTC launch time
            are used by Coming Soon / Maintenance when configured.
          </p>

          <label className={styles.field}>
            <span>Audit reason</span>
            <input
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Public mode message · optional</span>
            <textarea
              value={modeMessage}
              maxLength={500}
              onChange={(event) => setModeMessage(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Launch / return time · UTC · optional</span>
            <input
              type="datetime-local"
              value={launchAt}
              onChange={(event) => setLaunchAt(event.target.value)}
            />
            <small className={styles.help}>
              Ignored when switching to LIVE. Public countdown appears while a
              future TESTING or MAINTENANCE launch time is present.
            </small>
          </label>
        </article>

        <aside className={styles.preview}>
          <div className={styles.sectionEyebrow}>PUBLIC PREVIEW</div>
          <h3>
            {status?.siteMode === "LIVE"
              ? "FixTradeZone is live"
              : status?.siteMode === "MAINTENANCE"
                ? "Maintenance page"
                : "Coming Soon page"}
          </h3>
          <p>
            {status?.modeMessage ||
              (status?.siteMode === "MAINTENANCE"
                ? "FixTradeZone is undergoing scheduled platform maintenance."
                : status?.siteMode === "TESTING"
                  ? "FixTradeZone is currently in controlled pre-launch testing."
                  : "The normal public application is available.")}
          </p>
          <div className={styles.previewMeta}>
            <span>Login: {status?.siteMode === "LIVE" ? "PUBLIC" : status?.siteMode === "TESTING" ? "TESTERS + SUPER_ADMIN" : "SUPER_ADMIN ONLY"}</span>
            <span>Registration: {status?.siteMode === "LIVE" ? "ENABLED" : "DISABLED"}</span>
            <span>Launch: {formatPlatformDateTime(status?.launchAt)}</span>
          </div>
        </aside>
      </div>

      <article className={styles.card}>
        <div className={styles.sectionEyebrow}>TESTER ACCESS</div>
        <h3>Approved testing users · {testers.length}</h3>
        <p>
          TESTING mode permits these ACTIVE users plus SUPER_ADMIN. Normal users
          remain blocked by the backend access policy.
        </p>

        <div className={styles.testerForm}>
          <input
            aria-label="Tester username or email"
            placeholder="Username or email"
            value={testerIdentifier}
            onChange={(event) => setTesterIdentifier(event.target.value)}
          />
          <input
            aria-label="Tester note"
            placeholder="Optional audit note"
            value={testerNote}
            maxLength={500}
            onChange={(event) => setTesterNote(event.target.value)}
          />
          <button
            className={styles.primary}
            type="button"
            disabled={busy}
            onClick={() => void addTester()}
          >
            Add tester
          </button>
        </div>

        <div className={styles.testerList}>
          {testers.length === 0 ? (
            <p>No approved testing users yet.</p>
          ) : (
            testers.map((tester) => (
              <div className={styles.testerRow} key={tester.userId}>
                <div className={styles.testerIdentity}>
                  <strong>{tester.username}</strong>
                  <span>{tester.email ?? "No email"}</span>
                  <small>{tester.note ?? "No note"}</small>
                </div>
                <button
                  className={styles.danger}
                  type="button"
                  disabled={busy}
                  onClick={() => void removeTester(tester)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.sectionEyebrow}>EMERGENCY RECOVERY</div>
        <h3>Temporary manual recovery while LIVE</h3>
        <p>
          LIVE keeps ordinary manual processing locked. SUPER_ADMIN can open a
          short audited recovery window without changing the platform out of LIVE.
        </p>

        <div className={styles.twoColumn}>
          <label className={styles.field}>
            <span>Recovery reason</span>
            <input
              value={recoveryReason}
              maxLength={500}
              onChange={(event) => setRecoveryReason(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Duration · 5–60 minutes</span>
            <input
              type="number"
              min={5}
              max={60}
              value={recoveryMinutes}
              onChange={(event) => setRecoveryMinutes(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.inlineMeta}>
          <span>Recovery active: {status?.recoveryActive ? "YES" : "NO"}</span>
          <span>Until: {formatPlatformDateTime(status?.recoveryUnlockedUntil)}</span>
          <span>Reason: {status?.recoveryReason ?? "—"}</span>
        </div>

        <div className={styles.recoveryActions}>
          <span className={styles.help}>
            {status?.siteMode === "LIVE"
              ? "Available only to SUPER_ADMIN and always audited."
              : "Recovery unlock is only used while Platform Mode is LIVE."}
          </span>
          <div className={styles.recoveryActions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy || status?.siteMode !== "LIVE" || status?.recoveryActive}
              onClick={() => void unlockRecovery()}
            >
              Unlock recovery
            </button>
            <button
              className={styles.danger}
              type="button"
              disabled={busy || !status?.recoveryActive}
              onClick={() => void lockRecovery()}
            >
              Lock now
            </button>
          </div>
        </div>
      </article>

      <footer className={styles.footer}>
        <div>
          <strong>UTC platform standard · SUPER_ADMIN only · audited</strong>
          <p>
            Last mode update: {formatPlatformDateTime(status?.updatedAt)} · Tester count: {status?.testerCount ?? testers.length}
          </p>
        </div>
        <Link href="/audit-logs">Open Audit Logs →</Link>
      </footer>
    </section>
  );
}
