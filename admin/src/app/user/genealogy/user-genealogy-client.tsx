"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GenealogyTree from "@/components/genealogy/genealogy-tree";
import LevelWiseMembers from "./level-wise-members";
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
  const [tab, setTab] = useState<"tree" | "levels">("tree");
  const [counts, setCounts] = useState<{ directCount: number; teamCount: number } | null>(null);

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

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(
          "/api/user/referrals/genealogy/levels?level=1&page=1&limit=1",
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) handleAccessError(401);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          directCount: number;
          teamCount: number;
        };
        if (!controller.signal.aborted) {
          setCounts({
            directCount: payload.directCount,
            teamCount: payload.teamCount,
          });
        }
      } catch {
        // The existing tree remains usable even if count retrieval fails.
      }
    })();

    return () => controller.abort();
  }, [session, handleAccessError]);

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

        <div className={styles.counts} aria-label="Your referral network size">
          <span>Direct Members: <strong>{counts?.directCount ?? "—"}</strong></span>
          <span>Total Team Members: <strong>{counts?.teamCount ?? "—"}</strong></span>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Genealogy views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tree"}
            onClick={() => setTab("tree")}
          >
            Genealogy Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "levels"}
            onClick={() => setTab("levels")}
          >
            Level-wise Members
          </button>
        </div>

        <div role="tabpanel" aria-label="Genealogy Tree" hidden={tab !== "tree"}>
          <GenealogyTree
            apiPath="/api/user/referrals/genealogy"
            onAccessError={handleAccessError}
          />
        </div>
        <div role="tabpanel" aria-label="Level-wise Members" hidden={tab !== "levels"}>
          {tab === "levels" ? <LevelWiseMembers onAccessError={handleAccessError} /> : null}
        </div>
      </div>
    </UserShell>
  );
}
