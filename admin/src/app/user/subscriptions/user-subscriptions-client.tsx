"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import UserSubscriptionsPanel from "../packages/user-subscriptions-panel";
import styles from "../packages/user-packages.module.css";

type SessionPayload = UserDirectSession & {
  message?: string | string[];
  redirectTo?: string | null;
};

function messageFrom(payload: SessionPayload | null, fallback: string) {
  if (typeof payload?.message === "string") return payload.message;
  if (Array.isArray(payload?.message)) return payload.message[0] ?? fallback;
  return fallback;
}

export default function UserSubscriptionsClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | SessionPayload
          | null;

        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (response.status === 403) {
          router.replace(
            payload?.redirectTo === "/dashboard" ? "/dashboard" : "/login",
          );
          router.refresh();
          return;
        }

        if (!response.ok || !payload?.user || !payload.sessionPolicy) {
          throw new Error(messageFrom(payload, "Unable to load USER session."));
        }

        if (mounted) setSession(payload);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load USER session.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading subscriptions…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.errorState}>
          <i className="iconoir-warning-triangle" />
          <strong>Subscriptions unavailable</strong>
          <p>{error || "Unable to load your subscriptions."}</p>
        </div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span>SUB-02 / SUBSCRIPTIONS</span>
            <h2>My Subscriptions</h2>
            <p>
              Review active package subscriptions and immutable activation history
              without changing published package terms or accounting state.
            </p>
          </div>
        </header>

        <UserSubscriptionsPanel />
      </div>
    </UserShell>
  );
}
