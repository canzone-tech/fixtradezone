"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import PlatformPromise from "@/components/brand/platform-promise";
import AdminIdleLock from "@/components/security/admin-idle-lock";
import Startbar from "./navigation/startbar";
import Topbar from "./topbar/topbar";

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 992) {
        document.body.classList.remove("ftz-nav-open");
      }
    };

    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  const showPlatformPromise = pathname === "/dashboard";

  return (
    <div className="ftz-admin-app">
      <Startbar />
      <Topbar />
      <AdminIdleLock />
      <main className="ftz-main">
        <div className="ftz-page-frame">
          {showPlatformPromise ? <PlatformPromise /> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
