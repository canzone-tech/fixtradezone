"use client";

import { useEffect, useState } from "react";
import styles from "../simulated-trades/simulated-trades.module.css";

interface PoliciesPayload {
  policies?: Array<{ id: string }>;
  message?: string | string[];
}

interface SessionPayload {
  user?: { roles?: string[] };
  message?: string | string[];
}

function messageFrom(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }
  const message = payload.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string") {
    return message[0];
  }
  return fallback;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function InitialPolicyDraftAction() {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkFreshState() {
      try {
        const [sessionResponse, policiesResponse] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/admin/simulated-activity/policies", { cache: "no-store" }),
        ]);
        const session = await readPayload<SessionPayload>(sessionResponse);
        const policies = await readPayload<PoliciesPayload>(policiesResponse);
        if (!active) return;
        const isSuperAdmin = session?.user?.roles?.includes("SUPER_ADMIN") === true;
        setVisible(
          sessionResponse.ok &&
            policiesResponse.ok &&
            isSuperAdmin &&
            Array.isArray(policies?.policies) &&
            policies.policies.length === 0,
        );
      } catch {
        if (active) setVisible(false);
      }
    }

    void checkFreshState();
    return () => {
      active = false;
    };
  }, []);

  async function createInitialDraft() {
    if (saving) return;
    const reason = window.prompt(
      "Audited reason for creating the first Trade Activity policy draft:",
      "Initial Trade Activity policy setup",
    );
    if (!reason || reason.trim().length < 3) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/simulated-activity/policies/drafts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const payload = await readPayload<PoliciesPayload>(response);
      if (!response.ok) {
        throw new Error(
          messageFrom(payload, "Unable to create the initial Trade Activity policy draft."),
        );
      }
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the initial Trade Activity policy draft.",
      );
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>VERSIONED POLICY / INITIAL SETUP</p>
          <h3>Create V1 Draft</h3>
        </div>
        <span className={styles.badge} data-tone="warning">
          REQUIRED
        </span>
      </div>
      <p className={styles.muted}>
        No Trade Activity policy exists yet. Create the first draft, review the
        defaults, then save and publish it from the policy workspace below.
      </p>
      {error ? (
        <div className={styles.alert} data-tone="error">
          {error}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          className={styles.button}
          type="button"
          onClick={() => void createInitialDraft()}
          disabled={saving}
        >
          {saving ? "Creating…" : "Create V1 Draft"}
        </button>
      </div>
    </section>
  );
}
