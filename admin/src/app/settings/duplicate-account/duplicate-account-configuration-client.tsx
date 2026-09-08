"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";
import { formatPlatformDateTime } from "@/lib/platform-time";
import PlatformSettingsNav from "../platform-settings-nav";
import styles from "./duplicate-account.module.css";

type EnforcementMode = "OFF" | "MONITOR" | "RESTRICT" | "BLOCK";
type AllowlistType = "DEVICE_INSTALLATION_ID" | "IP_ADDRESS";

interface DuplicateConfig {
  enforcementMode: EnforcementMode;
  deviceSignalEnabled: boolean;
  ipSignalEnabled: boolean;
  updatedAt: string | null;
}

interface AllowlistEntry {
  id: string;
  type: AllowlistType;
  value: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RiskEvent {
  id: string;
  attemptedEmail: string | null;
  installationId: string | null;
  ipAddress: string | null;
  enforcementMode: EnforcementMode;
  action: "ALLOWED" | "MONITORED" | "RESTRICTED" | "BLOCKED" | "BYPASSED";
  bypassType: AllowlistType | null;
  matchedUserIds: unknown;
  createdAt: string;
}

interface Snapshot {
  config: DuplicateConfig;
  allowlist: AllowlistEntry[];
  recentEvents: RiskEvent[];
  message?: string;
}

interface ApiError {
  message?: string | string[];
}

function messageOf(payload: ApiError | null, fallback: string) {
  if (typeof payload?.message === "string") return payload.message;
  if (Array.isArray(payload?.message)) return payload.message[0] ?? fallback;
  return fallback;
}

export default function DuplicateAccountConfigurationClient() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<EnforcementMode>("OFF");
  const [allowType, setAllowType] = useState<AllowlistType>(
    "DEVICE_INSTALLATION_ID",
  );
  const [allowValue, setAllowValue] = useState("");
  const [allowLabel, setAllowLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load(): Promise<Snapshot | null> {
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = (await sessionResponse.json().catch(() => ({}))) as {
      user?: AdminUser;
    };

    if (!sessionResponse.ok || !session.user) {
      router.replace("/login");
      return null;
    }
    if (!session.user.roles.includes("SUPER_ADMIN")) {
      router.replace("/dashboard");
      return null;
    }

    const response = await fetch("/api/admin/settings/duplicate-account", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Snapshot | null;
    if (!response.ok || !payload?.config) {
      throw new Error(
        messageOf(
          payload as ApiError | null,
          "Unable to load duplicate-account protection.",
        ),
      );
    }

    return payload;
  }

  useEffect(() => {
    let mounted = true;

    void load()
      .then((payload) => {
        if (mounted && payload) {
          setSnapshot(payload);
          setMode(payload.config.enforcementMode);
        }
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load duplicate-account protection.",
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
    // load intentionally belongs to initial authenticated settings bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveMode() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/settings/duplicate-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforcementMode: mode }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; config?: DuplicateConfig }
        | null;
      if (!response.ok || !payload?.config) {
        throw new Error(
          messageOf(
            payload as ApiError | null,
            "Unable to save enforcement mode.",
          ),
        );
      }

      setSnapshot((current) =>
        current
          ? { ...current, config: payload.config as DuplicateConfig }
          : current,
      );
      setSuccess(payload.message ?? "Duplicate-account mode updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save mode.");
    } finally {
      setSaving(false);
    }
  }

  async function addAllowlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowValue.trim()) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        "/api/admin/settings/duplicate-account/allowlist",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: allowType,
            value: allowValue.trim(),
            label: allowLabel.trim() || undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; entry?: AllowlistEntry }
        | null;
      if (!response.ok || !payload?.entry) {
        throw new Error(
          messageOf(
            payload as ApiError | null,
            "Unable to add allowlist entry.",
          ),
        );
      }

      setSnapshot((current) =>
        current
          ? {
              ...current,
              allowlist: [payload.entry as AllowlistEntry, ...current.allowlist],
            }
          : current,
      );
      setAllowValue("");
      setAllowLabel("");
      setSuccess(payload.message ?? "Allowlist entry added.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to add allowlist entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeAllowlist(id: string) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/settings/duplicate-account/allowlist/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) {
        throw new Error(messageOf(payload, "Unable to remove allowlist entry."));
      }

      setSnapshot((current) =>
        current
          ? {
              ...current,
              allowlist: current.allowlist.filter((entry) => entry.id !== id),
            }
          : current,
      );
      setSuccess(messageOf(payload, "Allowlist entry removed."));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to remove allowlist entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>Loading duplicate-account protection…</div>
    );
  }

  return (
    <main className={styles.page}>
      <PlatformSettingsNav active="duplicate-account" />

      <header className={styles.header}>
        <div>
          <span>SUPERADMIN ONLY</span>
          <h1>One Person = One Account</h1>
          <p>
            Device installation ID is the strong duplicate-risk signal. IP is
            supporting context only and never blocks an account by itself.
          </p>
        </div>
        <span className={styles.modeBadge}>
          {snapshot?.config.enforcementMode ?? mode}
        </span>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span>ENFORCEMENT</span>
            <h2>Duplicate account mode</h2>
          </div>
        </div>

        <div className={styles.modeGrid}>
          {(["OFF", "MONITOR", "RESTRICT", "BLOCK"] as EnforcementMode[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? styles.modeActive : styles.modeButton}
                onClick={() => setMode(value)}
                disabled={saving}
              >
                <strong>{value}</strong>
                <span>
                  {value === "OFF"
                    ? "Observe only normal registration; no duplicate enforcement."
                    : value === "MONITOR"
                      ? "Allow registration and create an immutable risk event."
                      : value === "RESTRICT"
                        ? "Create the account restricted; email verification does not activate it."
                        : "Reject registration when the installation is already linked."}
                </span>
              </button>
            ),
          )}
        </div>

        <button
          className={styles.primary}
          type="button"
          onClick={() => void saveMode()}
          disabled={saving}
        >
          Save enforcement mode
        </button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span>LOCAL / TEST BYPASS</span>
            <h2>Allowlist</h2>
          </div>
        </div>
        <p className={styles.note}>
          Use exact device installation IDs or exact IP addresses for approved
          local/testing bypasses. Every change is audited.
        </p>

        <form className={styles.allowForm} onSubmit={addAllowlist}>
          <select
            value={allowType}
            onChange={(event) =>
              setAllowType(event.target.value as AllowlistType)
            }
            disabled={saving}
          >
            <option value="DEVICE_INSTALLATION_ID">Device installation ID</option>
            <option value="IP_ADDRESS">IP address</option>
          </select>
          <input
            value={allowValue}
            onChange={(event) => setAllowValue(event.target.value)}
            placeholder={
              allowType === "DEVICE_INSTALLATION_ID"
                ? "UUID v4 installation ID"
                : "127.0.0.1"
            }
            required
            disabled={saving}
          />
          <input
            value={allowLabel}
            onChange={(event) => setAllowLabel(event.target.value)}
            placeholder="Label (optional)"
            maxLength={100}
            disabled={saving}
          />
          <button type="submit" disabled={saving}>
            Add allowlist
          </button>
        </form>

        <div className={styles.list}>
          {snapshot?.allowlist.length ? (
            snapshot.allowlist.map((entry) => (
              <div key={entry.id} className={styles.listRow}>
                <div>
                  <strong>{entry.type}</strong>
                  <code>{entry.value}</code>
                  <span>{entry.label || "No label"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void removeAllowlist(entry.id)}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className={styles.empty}>No allowlist entries configured.</p>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span>IMMUTABLE READBACK</span>
            <h2>Recent risk events</h2>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Mode</th>
                <th>Email</th>
                <th>Device</th>
                <th>IP</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.recentEvents.length ? (
                snapshot.recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.action}</td>
                    <td>{event.enforcementMode}</td>
                    <td>{event.attemptedEmail ?? "—"}</td>
                    <td>
                      <code>{event.installationId ?? "—"}</code>
                    </td>
                    <td>{event.ipAddress ?? "—"}</td>
                    <td>{formatPlatformDateTime(event.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No duplicate-account risk events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
    </main>
  );
}
