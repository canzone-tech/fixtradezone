"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/register"]);

export default function AuthPublicNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAuthPage = PUBLIC_AUTH_PATHS.has(pathname);

  useEffect(() => {
    if (!isPublicAuthPage) return;

    const brandTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".ftz-auth-brand, .ftz-auth-mobile-brand",
      ),
    );

    const goHome = () => router.push("/");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      goHome();
    };

    for (const brand of brandTargets) {
      brand.classList.add("ftz-auth-home-enabled");
      brand.setAttribute("role", "link");
      brand.setAttribute("tabindex", "0");
      brand.setAttribute("aria-label", "Back to FixTradeZone website");
      brand.addEventListener("click", goHome);
      brand.addEventListener("keydown", onKeyDown);
    }

    return () => {
      for (const brand of brandTargets) {
        brand.classList.remove("ftz-auth-home-enabled");
        brand.removeAttribute("role");
        brand.removeAttribute("tabindex");
        brand.removeAttribute("aria-label");
        brand.removeEventListener("click", goHome);
        brand.removeEventListener("keydown", onKeyDown);
      }
    };
  }, [isPublicAuthPage, router]);

  if (!isPublicAuthPage) return null;

  return (
    <Link className="ftz-auth-public-home-link" href="/">
      <i className="iconoir-arrow-left" aria-hidden="true" />
      <span>Back to website</span>
    </Link>
  );
}
