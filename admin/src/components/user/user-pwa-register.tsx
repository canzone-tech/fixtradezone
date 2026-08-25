"use client";

import { useEffect } from "react";

export default function UserPwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/user/",
          updateViaCache: "none",
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("FixTradeZone PWA service worker registration failed.", error);
        }
      }
    };

    void register();
  }, []);

  return null;
}
