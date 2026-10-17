"use client";

import { useEffect, useState } from "react";

interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

function decodeVapidKey(encoded: string): ArrayBuffer {
  const raw = atob(encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(encoded.length / 4) * 4,
    "=",
  ));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function supportedBrowser(): boolean {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export default function TradePushControls() {
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const browserReady = supportedBrowser();
    setSupported(browserReady);
    if (!browserReady) return;

    void fetch("/api/user/notifications/push", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Push configuration unavailable.");
        return (await response.json()) as PushConfig;
      })
      .then(setConfig)
      .catch(() => setMessage("Push configuration could not be loaded."));
  }, []);

  async function enable() {
    if (!config?.enabled || !config.publicKey || !supported) return;
    setBusy(true);
    setMessage("");
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        setMessage("Browser notifications are blocked. Enable them in your browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const newSubscription = !subscription;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.publicKey),
        });
      }

      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        throw new Error("Browser did not return valid push credentials.");
      }
      const response = await fetch("/api/user/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: payload.endpoint,
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
        }),
      });
      if (!response.ok) {
        if (newSubscription) await subscription.unsubscribe();
        throw new Error("Cannot save push subscription. Please try again.");
      }
      setMessage("Daily Trade WIN/LOSS push alerts enabled for this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!supported) return;
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setMessage("No active browser subscription found.");
        return;
      }
      const response = await fetch("/api/user/notifications/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error("Could not disable this browser subscription.");
      await subscription.unsubscribe();
      setMessage("WIN/LOSS browser push alerts disabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Daily Trade browser notifications"
      style={{
        padding: 20,
        border: "1px solid rgba(64, 199, 218, .3)",
        borderRadius: 14,
        background: "rgba(8, 26, 55, .75)",
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
        Daily Trade WIN/LOSS Push Notifications
      </h2>
      <p style={{ margin: "0 0 14px", opacity: .85 }}>
        Get browser or installed PWA alerts for new V1 and V2 Daily Trade results.
        Permission is optional; your Notifications inbox still works without it.
      </p>
      {supported === false ? (
        <p role="status">
          Push requires a supported browser and HTTPS (localhost is supported).
          On iPhone, install the PWA to your Home Screen first.
        </p>
      ) : config?.enabled ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <button type="button" disabled={busy} onClick={() => void enable()}
            style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
            {busy ? "Working…" : "Enable on this device"}
          </button>
          <button type="button" disabled={busy} onClick={() => void disable()}
            style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
            Disable on this device
          </button>
        </div>
      ) : (
        <p role="status">
          Browser push is not configured for this environment yet.
        </p>
      )}
      {message ? <p role="status" style={{ marginTop: 12 }}>{message}</p> : null}
    </section>
  );
}
