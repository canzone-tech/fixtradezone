"use client";

import { type ReactNode, useEffect } from "react";
import Startbar from "./navigation/startbar";
import Topbar from "./topbar/topbar";

export default function AdminShell({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 992) {
        document.body.classList.remove("ftz-nav-open");
      }
    };

    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  return (
    <div className="ftz-admin-app">
      <Startbar />
      <Topbar />
      <main className="ftz-main">{children}</main>
    </div>
  );
}
