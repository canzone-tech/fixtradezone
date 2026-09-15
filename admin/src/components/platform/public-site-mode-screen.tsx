"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicSiteModeStatus } from "@/lib/site-mode";
import styles from "./public-site-mode-screen.module.css";

interface Props {
  status: PublicSiteModeStatus | null;
}

function countdownParts(target: string | null, now: number) {
  if (!target) return null;

  const targetMs = Date.parse(target);
  if (!Number.isFinite(targetMs)) return null;

  const remaining = Math.max(0, targetMs - now);
  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function PublicSiteModeScreen({ status }: Props) {
  const initialNow = status ? Date.parse(status.serverTime) : 0;
  const [now, setNow] = useState(
    Number.isFinite(initialNow) ? initialNow : 0,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const countdown = useMemo(
    () => countdownParts(status?.launchAt ?? null, now),
    [status?.launchAt, now],
  );

  const unavailable = status === null;
  const maintenance = status?.siteMode === "MAINTENANCE";
  const badge = unavailable
    ? "SERVICE STATUS"
    : maintenance
      ? "MAINTENANCE MODE"
      : "TESTING MODE";
  const title = unavailable
    ? "Service temporarily unavailable."
    : maintenance
      ? "We’ll be back shortly."
      : "Coming soon.";
  const message = unavailable
    ? "FixTradeZone cannot currently verify platform availability. Public access remains closed until service status is restored."
    : status.message?.trim() ||
      (maintenance
        ? "FixTradeZone is undergoing scheduled platform maintenance."
        : "FixTradeZone is currently in controlled pre-launch testing.");

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.mark}>FTZ</span>

        <div className={styles.badge}>
          <i
            className={
              maintenance || unavailable ? "iconoir-tools" : "iconoir-flask"
            }
          />
          {badge}
        </div>

        <h1>{title}</h1>
        <p className={styles.copy}>{message}</p>

        {countdown ? (
          <div className={styles.countdown} aria-label="Launch countdown">
            <div>
              <strong>{countdown.days}</strong>
              <span>DAYS</span>
            </div>
            <div>
              <strong>{String(countdown.hours).padStart(2, "0")}</strong>
              <span>HOURS</span>
            </div>
            <div>
              <strong>{String(countdown.minutes).padStart(2, "0")}</strong>
              <span>MINUTES</span>
            </div>
            <div>
              <strong>{String(countdown.seconds).padStart(2, "0")}</strong>
              <span>SECONDS</span>
            </div>
          </div>
        ) : null}

        {!unavailable ? (
          <div className={styles.actions}>
            <Link href="/login">
              <i className="iconoir-log-in" />
              Authorized access
            </Link>
          </div>
        ) : null}

        <p className={styles.note}>
          {status?.siteMode === "TESTING"
            ? "Approved testing accounts and SUPER_ADMIN may sign in."
            : maintenance
              ? "SUPER_ADMIN recovery access remains available."
              : "Please try again after platform status is restored."}
        </p>
      </section>
    </main>
  );
}
