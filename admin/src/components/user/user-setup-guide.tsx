"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { DepositsResponse } from "@/lib/deposits";
import type { UserDirectSession } from "@/lib/user-session";
import styles from "./user-setup-guide.module.css";

interface SubscriptionSummaryResponse {
  active?: Array<{ id: string }>;
  history?: Array<{ id: string; status?: string }>;
}

interface SetupItem {
  key: string;
  label: string;
  complete: boolean;
  href: string | null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function UserSetupGuide({
  session,
}: {
  session: UserDirectSession;
}) {
  const pathname = usePathname();
  const [approvedDeposit, setApprovedDeposit] = useState(false);
  const [activePackage, setActivePackage] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(true);

  const profile = session.profileCompletion;
  const modalKey = `ftz:onboarding-dismissed:${session.user.id}:${
    session.user.lastLoginAt ?? session.user.createdAt
  }`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setModalDismissed(window.sessionStorage.getItem(modalKey) === "1");
  }, [modalKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      try {
        const [depositResponse, subscriptionResponse] = await Promise.all([
          fetch("/api/user/deposits?limit=100", { cache: "no-store" }),
          fetch("/api/user/subscriptions?limit=100", { cache: "no-store" }),
        ]);

        const deposits = depositResponse.ok
          ? await readJson<DepositsResponse>(depositResponse)
          : null;
        const subscriptions = subscriptionResponse.ok
          ? await readJson<SubscriptionSummaryResponse>(subscriptionResponse)
          : null;

        if (cancelled) return;

        setApprovedDeposit(
          Boolean(deposits?.deposits.some((item) => item.status === "APPROVED")),
        );
        setActivePackage(Boolean(subscriptions?.active?.length));
      } finally {
        if (!cancelled) setProgressLoaded(true);
      }
    }

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  const items = useMemo<SetupItem[]>(() => {
    const missing = new Set(profile?.missingFields ?? []);

    return [
      {
        key: "email",
        label: "Email verified",
        complete: Boolean(profile?.emailVerified),
        href: null,
      },
      {
        key: "profile",
        label: "Complete personal details",
        complete:
          Boolean(profile) &&
          !missing.has("FIRST_NAME") &&
          !missing.has("LAST_NAME") &&
          !missing.has("MOBILE_NUMBER"),
        href: "/user/profile",
      },
      {
        key: "wallet",
        label: "Add withdrawal address",
        complete: Boolean(profile?.withdrawal.address),
        href: "/user/profile",
      },
      {
        key: "deposit",
        label: "Make first deposit",
        complete: approvedDeposit,
        href: "/user/packages",
      },
      {
        key: "package",
        label: "Activate first package",
        complete: activePackage,
        href: "/user/packages",
      },
    ];
  }, [activePackage, approvedDeposit, profile]);

  const completed = items.filter((item) => item.complete).length;
  const setupComplete = completed === items.length;
  const showDashboardGuide =
    pathname === "/user/dashboard" && progressLoaded && !setupComplete;
  const showModal = showDashboardGuide && !modalDismissed;

  function dismissModal() {
    window.sessionStorage.setItem(modalKey, "1");
    setModalDismissed(true);
  }

  if (!profile) return null;

  return (
    <>
      {!profile.complete ? (
        <div className={styles.profileBanner} role="status">
          <div>
            <strong>Complete your profile</strong>
            <span>
              First name, last name, mobile number and a saved USDT — BNB Smart
              Chain (BEP-20) withdrawal address are required for a complete
              profile.
            </span>
          </div>
          <Link href="/user/profile">Complete profile</Link>
        </div>
      ) : null}

      {showDashboardGuide ? (
        <section className={styles.progressCard} aria-label="Getting Started">
          <div className={styles.progressHeader}>
            <div>
              <span>GETTING STARTED</span>
              <h2>
                Getting Started — {completed}/{items.length} completed
              </h2>
            </div>
            <Link href="/user/how-it-works">How FixTradeZone Works</Link>
          </div>

          <div className={styles.progressTrack}>
            <span style={{ width: `${(completed / items.length) * 100}%` }} />
          </div>

          <div className={styles.itemGrid}>
            {items.map((item) => (
              <div
                className={styles.setupItem}
                data-complete={item.complete ? "true" : "false"}
                key={item.key}
              >
                <i
                  className={
                    item.complete ? "iconoir-check-circle" : "iconoir-circle"
                  }
                />
                <span>{item.label}</span>
                {!item.complete && item.href ? (
                  <Link href={item.href}>Open</Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showModal ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ftz-onboarding-title"
          >
            <button
              className={styles.modalClose}
              type="button"
              aria-label="Dismiss onboarding"
              onClick={dismissModal}
            >
              ×
            </button>
            <span className={styles.modalEyebrow}>FIRST-LOGIN ONBOARDING</span>
            <h2 id="ftz-onboarding-title">Welcome to FixTradeZone</h2>
            <p>
              Finish these setup steps so deposits, packages, Daily Trades,
              wallet activity and withdrawals are ready to use.
            </p>

            <div className={styles.modalList}>
              {items.map((item) => (
                <div key={`modal-${item.key}`}>
                  <i
                    className={
                      item.complete ? "iconoir-check-circle" : "iconoir-circle"
                    }
                  />
                  <span>{item.label}</span>
                  {!item.complete && item.href ? (
                    <Link href={item.href} onClick={dismissModal}>
                      Continue
                    </Link>
                  ) : (
                    <strong>{item.complete ? "Done" : "Pending"}</strong>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <Link href="/user/how-it-works" onClick={dismissModal}>
                How it works
              </Link>
              <button type="button" onClick={dismissModal}>
                Continue to dashboard
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
