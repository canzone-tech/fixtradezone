"use client";

import { useState } from "react";
import styles from "./referral-share-actions.module.css";

interface ReferralShareActionsProps {
  referralCode: string | null;
  compact?: boolean;
}

function buildInviteUrl(referralCode: string): string {
  const inviteUrl = new URL("/register", window.location.origin);
  inviteUrl.searchParams.set("ref", referralCode);
  return inviteUrl.toString();
}

function openShareTarget(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

function WhatsAppMark() {
  return (
    <svg
      className={styles.brandIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.25a9.5 9.5 0 0 0-8.2 14.3L2.55 21.5l5.08-1.2A9.5 9.5 0 1 0 12 2.25Z"
        fill="#25D366"
      />
      <path
        d="M8.25 7.8c.22-.5.45-.52.82-.53h.68c.2 0 .42.07.53.32l.78 1.86c.1.25.08.46-.08.68l-.56.74c-.16.2-.2.38-.07.62.5.92 1.22 1.7 2.1 2.3.26.18.48.14.69-.1l.78-.9c.2-.23.42-.26.68-.14l1.82.86c.28.13.4.31.36.6-.12.83-.55 1.5-1.18 1.95-.63.45-1.42.55-2.23.31-1.78-.52-3.28-1.54-4.55-3.02-1.13-1.32-1.84-2.7-1.9-3.87-.04-.75.15-1.25.39-1.68Z"
        fill="#fff"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg
      className={styles.brandIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="#1877F2" />
      <path
        d="M13.45 19v-6h2.02l.3-2.25h-2.32V9.32c0-.65.18-1.1 1.17-1.1h1.24V6.2c-.21-.03-.96-.1-1.82-.1-1.8 0-3.03 1.1-3.03 3.12v1.53H9.1V13h1.9v6h2.45Z"
        fill="#fff"
      />
    </svg>
  );
}

function InstagramMark() {
  return (
    <svg
      className={styles.brandIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="instagram-gradient" x1="3" y1="21" x2="21" y2="3">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.28" stopColor="#FA7E1E" />
          <stop offset="0.52" stopColor="#D62976" />
          <stop offset="0.76" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#instagram-gradient)" />
      <rect
        x="5.25"
        y="5.25"
        width="13.5"
        height="13.5"
        rx="4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="3.2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <circle cx="16.65" cy="7.35" r="1" fill="#fff" />
    </svg>
  );
}

export default function ReferralShareActions({
  referralCode,
  compact = false,
}: ReferralShareActionsProps) {
  const [status, setStatus] = useState("");

  function inviteDetails() {
    if (!referralCode) return null;

    const url = buildInviteUrl(referralCode);
    return {
      url,
      text: `Join me on FixTradeZone using my referral link: ${url}`,
    };
  }

  function shareWhatsApp() {
    const invite = inviteDetails();
    if (!invite) return;

    openShareTarget(
      `https://wa.me/?text=${encodeURIComponent(invite.text)}`,
    );
    setStatus("WhatsApp share opened.");
  }

  function shareFacebook() {
    const invite = inviteDetails();
    if (!invite) return;

    openShareTarget(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
        invite.url,
      )}`,
    );
    setStatus("Facebook share opened.");
  }

  async function shareInstagram() {
    const invite = inviteDetails();
    if (!invite) return;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "FixTradeZone referral",
          text: "Join me on FixTradeZone using my referral link.",
          url: invite.url,
        });
        setStatus("Share sheet opened. Choose Instagram if available.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(invite.url);
      setStatus("Invite link copied. Paste it into Instagram.");
    } catch {
      setStatus("Open Instagram and paste your referral link manually.");
    }

    openShareTarget("https://www.instagram.com/");
  }

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      <div className={styles.actions} aria-label="Share referral link">
        <button
          type="button"
          onClick={shareWhatsApp}
          disabled={!referralCode}
        >
          <WhatsAppMark />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={shareFacebook}
          disabled={!referralCode}
        >
          <FacebookMark />
          Facebook
        </button>
        <button
          type="button"
          onClick={() => void shareInstagram()}
          disabled={!referralCode}
        >
          <InstagramMark />
          Instagram
        </button>
      </div>
      {status ? (
        <span className={styles.status} role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}
