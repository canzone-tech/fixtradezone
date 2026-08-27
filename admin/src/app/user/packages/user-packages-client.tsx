"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/user-shell";
import type { UserDirectSession } from "@/lib/user-session";
import {
  apiMessage,
  decimalLabel,
  enumLabel,
  readApiPayload,
  rewardRateLabel,
  type ApiErrorPayload,
  type PackageCatalogue,
} from "@/lib/packages";
import UserSubscriptionsPanel from "./user-subscriptions-panel";
import styles from "./user-packages.module.css";

function activationPolicyCopy(trigger: string, available: boolean) {
  if (!available) {
    return {
      headline: "ACTIVATION ENGINE DEFERRED",
      detail:
        "This published trigger requires an activation engine that is not live yet. New funding is disabled for safety.",
    };
  }

  if (trigger === "MANUAL_ACTIVATION") {
    return {
      headline: "AUTHORIZED MANUAL ACTIVATION",
      detail:
        "After payment approval and accounting, an authorized administrator completes package activation.",
    };
  }

  return {
    headline: "AUTO ACTIVATION ON APPROVAL",
    detail:
      "Approved and accounted payment activates the purchased package exactly once.",
  };
}

export default function UserPackagesClient() {
  const router = useRouter();
  const [session, setSession] = useState<UserDirectSession | null>(null);
  const [catalogue, setCatalogue] = useState<PackageCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const sessionResponse = await fetch("/api/user/session", {
          cache: "no-store",
        });
        const sessionPayload = await readApiPayload<
          UserDirectSession & ApiErrorPayload
        >(sessionResponse);

        if (sessionResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (sessionResponse.status === 403) {
          router.replace(
            sessionPayload?.redirectTo === "/dashboard"
              ? "/dashboard"
              : "/login",
          );
          router.refresh();
          return;
        }

        if (
          !sessionResponse.ok ||
          !sessionPayload?.user ||
          !sessionPayload.sessionPolicy
        ) {
          throw new Error(
            apiMessage(sessionPayload, "Unable to load USER session."),
          );
        }

        const catalogueResponse = await fetch("/api/user/packages", {
          cache: "no-store",
        });
        const cataloguePayload = await readApiPayload<
          PackageCatalogue & ApiErrorPayload
        >(catalogueResponse);

        if (catalogueResponse.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }

        if (!catalogueResponse.ok || !cataloguePayload) {
          throw new Error(
            apiMessage(cataloguePayload, "Unable to load package catalogue."),
          );
        }

        if (mounted) {
          setSession(sessionPayload);
          setCatalogue(cataloguePayload);
        }
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load package catalogue.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <UserShell session={null}>
        <div className="ftz-dashboard-loading">
          <span />
          <p>Loading published packages…</p>
        </div>
      </UserShell>
    );
  }

  if (!session || !catalogue) {
    return (
      <UserShell session={session}>
        <div className={styles.errorState}>
          <i className="iconoir-warning-triangle" />
          <strong>Package catalogue unavailable</strong>
          <p>{error || "Unable to load published package terms."}</p>
        </div>
      </UserShell>
    );
  }

  const activationPolicy = catalogue.plan
    ? activationPolicyCopy(
        catalogue.plan.activationTrigger,
        catalogue.activationAvailable,
      )
    : null;

  return (
    <UserShell session={session}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span>VERSIONED USDT CATALOGUE</span>
            <h2>Choose with clarity</h2>
            <p>
              Exact published package terms are shown here. Package activation
              is funded through the audited deposit/payment workflow.
            </p>
          </div>

          <div className={styles.headerStatus}>
            <i className="iconoir-shield-check" />
            <span>
              <strong>
                {activationPolicy?.headline ?? "PACKAGE ACTIVATION UNAVAILABLE"}
              </strong>
              <small>
                {activationPolicy?.detail ??
                  "No effective package activation policy is available."}
              </small>
            </span>
          </div>
        </header>

        <UserSubscriptionsPanel />

        {!catalogue.catalogueAvailable || !catalogue.plan ? (
          <section className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <i className="iconoir-box" />
            </div>
            <span>SAFE EMPTY STATE</span>
            <h3>Package catalogue is being reviewed</h3>
            <p>
              No package plan is currently published and effective. Nothing is
              purchasable or activatable until SUPER_ADMIN publishes the
              founder-approved catalogue.
            </p>
            <div className={styles.emptyGuardrail}>
              <i className="iconoir-lock" /> No fallback prices or invented
              availability are shown.
            </div>
          </section>
        ) : (
          <>
            <section className={styles.planStrip}>
              <div>
                <small>EFFECTIVE PLAN</small>
                <strong>V{catalogue.plan.versionNumber}</strong>
              </div>
              <div>
                <small>SETTLEMENT</small>
                <strong>{catalogue.plan.settlementTimezone}</strong>
              </div>
              <div>
                <small>ACTIVE PACKAGE MODE</small>
                <strong>{enumLabel(catalogue.plan.activePackageMode)}</strong>
              </div>
              <div>
                <small>ACTIVATION</small>
                <strong>{enumLabel(catalogue.plan.activationTrigger)}</strong>
              </div>
            </section>

            <section className={styles.catalogueGrid}>
              {catalogue.items.map((item, index) => (
                <article
                  className={`${styles.packageCard} ${
                    index >= catalogue.items.length - 2
                      ? styles.premiumCard
                      : ""
                  }`}
                  key={item.id}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.packageIndex}>
                      {String(item.sortOrder).padStart(2, "0")}
                    </span>
                    <span
                      className={`${styles.availability} ${
                        item.availability === "AVAILABLE"
                          ? styles.available
                          : styles.closed
                      }`}
                    >
                      {enumLabel(item.availability)}
                    </span>
                  </div>

                  <div className={styles.packageIcon}>
                    <i
                      className={
                        item.packageCode.startsWith("QUANT")
                          ? "iconoir-graph-up"
                          : "iconoir-brain"
                      }
                    />
                  </div>

                  <small className={styles.packageCode}>
                    {item.packageCode}
                  </small>
                  <h3>{item.displayName}</h3>

                  <div className={styles.price}>
                    <strong>{decimalLabel(item.price)}</strong>
                    <span>{item.currency}</span>
                  </div>

                  <div className={styles.rateBox}>
                    <small>USER / NET RATE</small>
                    <strong>{rewardRateLabel(item)}</strong>
                    <span>{enumLabel(item.rewardRateMode)}</span>
                  </div>

                  <dl className={styles.termList}>
                    <div>
                      <dt>Maximum total return</dt>
                      <dd>
                        {decimalLabel(item.maximumTotalReturn)} {item.currency}
                      </dd>
                    </div>
                    <div>
                      <dt>Maximum profit</dt>
                      <dd>
                        {decimalLabel(item.maximumProfit)} {item.currency}
                      </dd>
                    </div>
                    <div>
                      <dt>Cap</dt>
                      <dd>{decimalLabel(item.capMultiplier)}× total return</dd>
                    </div>
                    <div>
                      <dt>Goal / lifetime</dt>
                      <dd>{item.goalDays} calendar days</dd>
                    </div>
                    <div>
                      <dt>Reward cycle</dt>
                      <dd>{item.cycleDays} calendar days</dd>
                    </div>
                    <div>
                      <dt>Rewards begin</dt>
                      <dd>{enumLabel(item.rewardStartMode)}</dd>
                    </div>
                  </dl>

                  <div className={styles.activationNotice}>
                    <i className="iconoir-wallet" />
                    <span>
                      <strong>
                        {item.availability !== "AVAILABLE"
                          ? "Closed to new activation"
                          : catalogue.activationAvailable
                            ? activationPolicy?.headline
                            : "Activation engine deferred"}
                      </strong>
                      <small>
                        {item.availability !== "AVAILABLE"
                          ? "This package cannot accept a new activation under the current plan."
                          : catalogue.activationAvailable
                            ? activationPolicy?.detail
                            : "Funding is disabled until this plan's configured activation engine is available."}
                      </small>
                    </span>
                  </div>

                  {item.availability === "AVAILABLE" &&
                  catalogue.activationAvailable ? (
                    <Link href="/user/deposits" className={styles.depositLink}>
                      Open Deposits <i className="iconoir-arrow-right" />
                    </Link>
                  ) : null}
                </article>
              ))}
            </section>

            <section className={styles.disclosure}>
              <i className="iconoir-info-empty" />
              <div>
                <strong>How these values are governed</strong>
                <p>
                  Prices, percentages and caps come directly from one effective
                  published plan version. Financial values are exact decimal
                  strings. Each activation snapshots its source plan and payment
                  references so later plan changes never rewrite history.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </UserShell>
  );
}
