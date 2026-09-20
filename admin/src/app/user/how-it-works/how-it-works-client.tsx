"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./how-it-works.module.css";

interface ErrorPayload {
  message?: string;
  redirectTo?: string;
}

const STEPS = [
  {
    number: "01",
    title: "Fund Account",
    body: "Choose a published package and create a deposit request. Send only the supported asset on the exact network shown for that request, then submit the transaction ID for review.",
    href: "/user/packages",
    cta: "Choose package",
    icon: "iconoir-wallet",
  },
  {
    number: "02",
    title: "Activate Package",
    body: "After an approved deposit funds the package purchase, the package subscription becomes the financial lifecycle that drives Daily Trades, Trading settlement and package earnings.",
    href: "/user/subscriptions",
    cta: "View subscriptions",
    icon: "iconoir-box",
  },
  {
    number: "03",
    title: "Follow Daily Trades",
    body: "Daily Trades are generated and displayed first. They are the canonical source for schedule, asset, WIN/LOSS and raw result percentage. These are algorithm-generated platform results, not exchange-executed brokerage trades.",
    href: "/user/trade-activity",
    cta: "Open Daily Trades",
    icon: "iconoir-graph-up",
  },
  {
    number: "04",
    title: "Track Trading & Earnings",
    body: "Internal Trading financially interprets the matching Daily Trade for the package. Package targets, caps, progress, settlement and user/admin split are applied without changing the Daily Trade identity or raw result.",
    href: "/user/trading",
    cta: "Open Trading",
    icon: "iconoir-coins",
  },
  {
    number: "05",
    title: "Wallet & Withdraw",
    body: "Ledger-backed earnings and other eligible balances appear in Wallet. Withdrawals use the USDT — BNB Smart Chain (BEP-20) address saved in My Profile; each saved address is locked from changes for 30 days.",
    href: "/user/payouts",
    cta: "Open Withdrawal",
    icon: "iconoir-coins-swap",
  },
];

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function HowItWorksClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/user/session", {
          cache: "no-store",
        });
        const payload = await readPayload<UserDirectSession & ErrorPayload>(response);

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 403) {
          router.replace(
            payload?.redirectTo === "/dashboard" ? "/dashboard" : "/login",
          );
          return;
        }

        if (!response.ok || !payload?.user || !payload.sessionPolicy) {
          throw new Error(payload?.message || "Unable to load this guide.");
        }

        if (mounted) setSession(payload);
      } catch (caught) {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : "Unable to load this guide.");
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
          <p>Loading FixTradeZone guide…</p>
        </div>
      </UserShell>
    );
  }

  if (!session) {
    return (
      <UserShell session={null}>
        <div className={styles.error}>{error || "Guide unavailable."}</div>
      </UserShell>
    );
  }

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <section className={styles.hero}>
          <span>USER GUIDE</span>
          <h1>How FixTradeZone Works</h1>
          <p>
            The core flow is Deposit → Package → Daily Trades → Trading/Earnings
            → Wallet → Withdraw. Daily Trades appear first; Trading is the
            financial interpretation and settlement layer for the matching Daily
            Trade.
          </p>
        </section>

        <section className={styles.steps}>
          {STEPS.map((step) => (
            <article className={styles.step} key={step.number}>
              <div className={styles.stepIcon}>
                <i className={step.icon} />
              </div>
              <div className={styles.stepCopy}>
                <small>STEP {step.number}</small>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <Link href={step.href}>{step.cta}</Link>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.truthBox}>
          <i className="iconoir-shield-check" />
          <div>
            <strong>Product truth</strong>
            <p>
              Daily Trade results are generated/displayed by the platform and are
              not represented as exchange execution. Financial credits, package
              progress and withdrawal history remain separately ledger-backed and
              auditable.
            </p>
          </div>
        </section>
      </div>
    </UserShell>
  );
}
