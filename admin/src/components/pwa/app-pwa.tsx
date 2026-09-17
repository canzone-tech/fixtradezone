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

function isMobileLikeDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 1024px)").matches
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
  const [shouldRequireInstall, setShouldRequireInstall] = useState(false);
  const [ios, setIos] = useState(false);
  const [installAccepted, setInstallAccepted] = useState(false);

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
      setIos(isIosDevice());
      setShouldRequireInstall(
        isMobileLikeDevice() && !isStandaloneMode(),
      );
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
      setInstallAccepted(true);
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
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    installWindow.__ftzPwaInstallPrompt = null;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setInstallAccepted(true);
    }
  }

  const authInstallPage = pathname === "/login" || pathname === "/register";

  if (!authInstallPage || !shouldRequireInstall) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ftz-pwa-install-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(0,229,255,.16), transparent 38%), #030d1f",
        color: "#f1fbff",
      }}
    >
      <section
        style={{
          width: "min(100%, 430px)",
          border: "1px solid rgba(70,226,255,.32)",
          borderRadius: 24,
          padding: 28,
          background: "rgba(5,22,47,.96)",
          boxShadow: "0 24px 80px rgba(0,0,0,.5)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 68,
            height: 68,
            marginBottom: 20,
            borderRadius: 18,
            background:
              "url('/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg') center/cover no-repeat",
          }}
        />

        <p
          style={{
            margin: "0 0 8px",
            color: "#5ceadd",
            fontWeight: 800,
            letterSpacing: ".12em",
            fontSize: 12,
          }}
        >
          FIXTRADEZONE APP
        </p>

        <h1
          id="ftz-pwa-install-title"
          style={{ margin: "0 0 12px", fontSize: 28, lineHeight: 1.15 }}
        >
          {installAccepted
            ? "Open FixTradeZone from your Home Screen"
            : "Install FixTradeZone to continue"}
        </h1>

        <p style={{ margin: "0 0 22px", color: "#a7b8d4", lineHeight: 1.6 }}>
          {installAccepted
            ? "Installation is complete. Launch the installed FixTradeZone app to sign in or create your account."
            : "You can browse the public landing page in your browser. On mobile, sign in and registration continue inside the installed FixTradeZone app."}
        </p>

        {!installAccepted && installPrompt ? (
          <button
            type="button"
            onClick={() => void installApp()}
            style={{
              width: "100%",
              minHeight: 52,
              border: 0,
              borderRadius: 14,
              fontWeight: 800,
              cursor: "pointer",
              color: "#02131c",
              background: "linear-gradient(90deg,#24e5d3,#3cbcff)",
            }}
          >
            Install FixTradeZone
          </button>
        ) : !installAccepted ? (
          <div
            style={{
              borderRadius: 14,
              padding: 16,
              background: "rgba(255,255,255,.05)",
              color: "#d8e4f6",
              lineHeight: 1.55,
            }}
          >
            {ios
              ? "On iPhone/iPad: open the Share menu, choose Add to Home Screen, then launch FixTradeZone from the Home Screen."
              : "Open your browser menu and choose Install app or Add to Home screen, then launch FixTradeZone from the installed icon."}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              padding: 16,
              background: "rgba(255,255,255,.05)",
              color: "#d8e4f6",
              lineHeight: 1.55,
            }}
          >
            Return to your Home Screen and open the FixTradeZone icon.
          </div>
        )}
      </section>
    </div>
  );
}
