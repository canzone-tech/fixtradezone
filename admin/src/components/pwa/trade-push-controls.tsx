"use client";

import { useEffect, useState } from "react";
import { isStandaloneApp } from "@/lib/entry-experience";

interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

type OnboardingState =
  | "checking"
  | "hidden"
  | "prompt"
  | "blocked"
  | "error"
  | "working";

function decodeVapidKey(encoded: string): ArrayBuffer {
  const raw = atob(
    encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "="),
  );
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function browserSupportsPush(): boolean {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function syncSubscription(subscription: PushSubscription): Promise<void> {
  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error("Browser did not provide valid push credentials.");
  }

  const response = await fetch("/api/user/notifications/push", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not register notifications for this account.");
  }
}

/**
 * Displayed only inside an installed, authenticated USER PWA.
 * The browser requires an explicit gesture to request notification permission.
 */
export default function TradePushControls({ userId }: { userId: string }) {
  const [status, setStatus] = useState<OnboardingState>("checking");
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkPush() {
      // Avoid a synchronous state update directly from an effect.
      await Promise.resolve();

      if (!isStandaloneApp() || !browserSupportsPush()) {
        if (!cancelled) setStatus("hidden");
        return;
      }

      try {
        const response = await fetch("/api/user/notifications/push", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Push settings are unavailable.");

        const nextConfig = (await response.json()) as PushConfig;
        if (cancelled) return;

        if (!nextConfig.enabled || !nextConfig.publicKey) {
          // A deployment missing VAPID configuration must never block login.
          setStatus("hidden");
          return;
        }

        setConfig(nextConfig);

        if (Notification.permission === "denied") {
          const skipped = sessionStorage.getItem(
            `ftz:push-permission-blocked:${userId}`,
          );
          setStatus(skipped === "1" ? "hidden" : "blocked");
          return;
        }

        if (Notification.permission === "granted") {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await syncSubscription(subscription);
            if (!cancelled) setStatus("hidden");
            return;
          }
        }

        if (!cancelled) setStatus("prompt");
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Push setup failed.",
          );
          setStatus("error");
        }
      }
    }

    void checkPush();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function enableNotifications() {
    if (!config?.enabled || !config.publicKey) return;

    setError(null);

    // Must be invoked directly by the user's click, not in an effect.
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

    if (permission !== "granted") {
      setStatus("blocked");
      return;
    }

    setStatus("working");
    let created: PushSubscription | null = null;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.publicKey),
        });
        created = subscription;
      }

      await syncSubscription(subscription);
      setStatus("hidden");
    } catch (caught) {
      if (created) {
        await created.unsubscribe().catch(() => false);
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to enable notifications.",
      );
      setStatus("error");
    }
  }

  function continueWithoutPush() {
    // Only allow a fallback when the browser denied permission or setup failed.
    // Missing external push functionality must not permanently block users.
    if (status === "blocked") {
      try {
        sessionStorage.setItem(`ftz:push-permission-blocked:${userId}`, "1");
      } catch {
        // Storage may be disabled.
      }
    }
    setStatus("hidden");
  }

  if (status === "hidden" || status === "checking") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ftz-push-onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483646,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(1, 9, 24, .95)",
        color: "#f1fbff",
      }}
    >
      <section
        style={{
          width: "min(100%, 430px)",
          padding: 28,
          borderRadius: 22,
          border: "1px solid rgba(70, 226, 255, .36)",
          background: "#071a35",
          boxShadow: "0 24px 80px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden="true">
          🔔
        </div>
        <h2
          id="ftz-push-onboarding-title"
          style={{ fontSize: 24, margin: "0 0 12px" }}
        >
          Enable Daily Trade Alerts
        </h2>
        <p style={{ color: "#b1c3de", lineHeight: 1.55, marginBottom: 18 }}>
          Allow FixTradeZone to notify you when your V1 or V2
          algorithm-generated Daily Trades finish with WIN or LOSS results.
          Your in-app Notifications inbox remains available.
        </p>

        {status === "blocked" ? (
          <p role="alert" style={{ color: "#ffcc8b", lineHeight: 1.5 }}>
            Notifications were blocked by your browser. Open the app or site
            notification settings and allow notifications, then try again.
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: "#ffb4b4", lineHeight: 1.5 }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          autoFocus
          disabled={status === "working"}
          onClick={() => void enableNotifications()}
          style={{
            width: "100%",
            minHeight: 50,
            border: 0,
            borderRadius: 12,
            background: "#20d6c8",
            color: "#032029",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {status === "working" ? "Enabling…" : "Enable Notifications"}
        </button>

        {status === "blocked" || status === "error" ? (
          <button
            type="button"
            onClick={continueWithoutPush}
            style={{
              display: "block",
              width: "100%",
              padding: 12,
              marginTop: 12,
              border: "1px solid rgba(148,163,184,.4)",
              borderRadius: 12,
              background: "transparent",
              color: "#c8d9ec",
              cursor: "pointer",
            }}
          >
            Continue without push
          </button>
        ) : null}
      </section>
    </div>
  );
}
