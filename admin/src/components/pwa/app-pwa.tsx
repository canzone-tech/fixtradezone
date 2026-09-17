"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallPromptWindow = Window & {
  __ftzPwaInstallPrompt?: BeforeInstallPromptEvent | null;
};

function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function registerFullAppServiceWorker(): Promise<void> {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  const registrations = await navigator.serviceWorker.getRegistrations();

  await Promise.all(
    registrations
      .filter((candidate) => {
        if (candidate === registration) {
          return false;
        }

        try {
          return new URL(candidate.scope).pathname === "/user/";
        } catch {
          return false;
        }
      })
      .map((candidate) => candidate.unregister()),
  );
}

export default function AppPwa() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(() => {
      if (typeof window === "undefined") {
        return null;
      }

      return (window as InstallPromptWindow).__ftzPwaInstallPrompt ?? null;
    });
  const [standalone, setStandalone] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const installWindow = window as InstallPromptWindow;

    if ("serviceWorker" in navigator) {
      void registerFullAppServiceWorker().catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            "FixTradeZone PWA service worker registration failed.",
            error,
          );
        }
      });
    }

    const deviceStateFrame = window.requestAnimationFrame(() => {
      setStandalone(isStandaloneMode());
      setIos(isIosDevice());
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      installWindow.__ftzPwaInstallPrompt = promptEvent;
      setInstallPrompt(promptEvent);
    };

    const handleInstalled = () => {
      installWindow.__ftzPwaInstallPrompt = null;
      setInstallPrompt(null);
      setStandalone(true);
      setShowInstallHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.cancelAnimationFrame(deviceStateFrame);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    const installWindow = window as InstallPromptWindow;
    const promptEvent = installPrompt ?? installWindow.__ftzPwaInstallPrompt;

    if (!promptEvent) {
      setShowInstallHelp(true);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    installWindow.__ftzPwaInstallPrompt = null;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setStandalone(true);
      setShowInstallHelp(false);
    }
  }

  const authInstallPage = pathname === "/login" || pathname === "/register";

  if (!authInstallPage || standalone) {
    return null;
  }

  return (
    <aside
      aria-label="FixTradeZone app installation"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483000,
        width: "min(360px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 10,
          justifyItems: "end",
          pointerEvents: "auto",
        }}
      >
        {showInstallHelp ? (
          <div
            role="status"
            style={{
              width: "100%",
              border: "1px solid rgba(70,226,255,.28)",
              borderRadius: 14,
              padding: 14,
              background: "rgba(5,22,47,.98)",
              boxShadow: "0 18px 50px rgba(0,0,0,.38)",
              color: "#d8e4f6",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ display: "block", marginBottom: 5, color: "#f1fbff" }}>
              Install FixTradeZone
            </strong>
            {ios
              ? "On iPhone/iPad, open the Share menu and choose Add to Home Screen."
              : "Open your browser menu and choose Install app or Add to Home screen."}
            <button
              type="button"
              onClick={() => setShowInstallHelp(false)}
              aria-label="Close install help"
              style={{
                marginTop: 10,
                border: 0,
                padding: 0,
                background: "transparent",
                color: "#5ceadd",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void installApp()}
          style={{
            minHeight: 44,
            border: "1px solid rgba(70,226,255,.35)",
            borderRadius: 999,
            padding: "0 18px",
            background: "rgba(5,22,47,.96)",
            boxShadow: "0 12px 36px rgba(0,0,0,.35)",
            color: "#f1fbff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Install App
        </button>
      </div>
    </aside>
  );
}
