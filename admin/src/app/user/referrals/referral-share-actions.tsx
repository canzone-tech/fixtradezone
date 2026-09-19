"use client";

import { useState } from "react";
import styles from "./referral-share-actions.module.css";

interface ReferralShareActionsProps {
  referralCode: string | null;
}

function buildInviteUrl(referralCode: string): string {
  const inviteUrl = new URL("/register", window.location.origin);
  inviteUrl.searchParams.set("ref", referralCode);
  return inviteUrl.toString();
}

function openShareTarget(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function ReferralShareActions({
  referralCode,
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
    <div className={styles.wrap}>
      <div className={styles.actions} aria-label="Share referral link">
        <button
          type="button"
          onClick={shareWhatsApp}
          disabled={!referralCode}
        >
          <i className="iconoir-chat-bubble" />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={shareFacebook}
          disabled={!referralCode}
        >
          <i className="iconoir-share-android" />
          Facebook
        </button>
        <button
          type="button"
          onClick={() => void shareInstagram()}
          disabled={!referralCode}
        >
          <i className="iconoir-share-ios" />
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
