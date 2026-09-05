"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GenealogyTree from "@/components/genealogy/genealogy-tree";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./user-genealogy.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function UserGenealogyClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", { cache: "no-store" });
        const payload = await readPayload<UserDirectSession & ErrorPayload>(
          response,
        );

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
          throw new Error(payload?.message || "Unable to load USER session.");
        }

        if (mounted) setSession(payload);
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load genealogy session.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      void loadSession();
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [router]);

  const handleAccessError = useCallback(
    (status: number) => {
      if (status === 401) {
        router.replace("/login");
        router.refresh();
      }
    },
    [router],
  );

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading genealogy workspace…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.errorState}>
          <i className="iconoir-warning-triangle" />
          <strong>Genealogy workspace unavailable</strong>
          <p>{error || "Unable to load your referral network."}</p>
        </div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span>REFERRAL NETWORK</span>
            <h2>My Genealogy</h2>
            <p>
              Explore your own downline level by level. Nodes are loaded only
              when expanded so large networks stay fast and private.
            </p>
          </div>
          <div className={styles.legend}>
            <span>Account status</span>
            <span>Active package indicator</span>
            <span>Direct count</span>
          </div>
        </header>

        <GenealogyTree
          apiPath="/api/user/referrals/genealogy"
          onAccessError={handleAccessError}
        />
      </div>
    </UserShell>
  );
}
