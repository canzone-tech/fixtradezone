"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";

export default function Topbar() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        user?: AdminUser;
      };

      if (!response.ok || !payload.user) {
        router.replace("/login");
        return;
      }

      if (mounted) setUser(payload.user);
    }

    void loadSession();

    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onShortcut);

    return () => {
      mounted = false;
      window.removeEventListener("keydown", onShortcut);
    };
  }, [router]);

  const displayName = useMemo(() => {
    if (!user) return "Super Admin";

    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Super Admin"
    );
  }, [user]);

  const initials = useMemo(
    () =>
      displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [displayName],
  );

  const toggleSidebar = () => {
    document.body.classList.toggle("ftz-nav-open");
  };

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="ftz-topbar">
      <div className="ftz-topbar-title">
        <button
          type="button"
          className="ftz-icon-button ftz-menu-toggle"
          aria-label="Toggle navigation"
          onClick={toggleSidebar}
        >
          <i className="iconoir-menu-scale" />
        </button>

        <div>
          <h1>Dashboard</h1>
          <p>Real-time overview of your platform</p>
        </div>
      </div>

      <div className="ftz-topbar-actions">
        <label className="ftz-search">
          <i className="iconoir-search" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search users, transactions, packages..."
            aria-label="Search admin portal"
          />
          <kbd>Ctrl + K</kbd>
        </label>

        <button
          type="button"
          className="ftz-icon-button"
          aria-label="Favorites"
          title="Favorites"
        >
          <i className="iconoir-star" />
        </button>

        <button
          type="button"
          className="ftz-icon-button ftz-notification"
          aria-label="Notifications"
          title="Notifications"
        >
          <i className="iconoir-bell" />
          <span>8</span>
        </button>

        <div className="ftz-topbar-profile">
          <div className="ftz-avatar">{initials}</div>
          <div className="ftz-topbar-profile-copy">
            <strong>{displayName}</strong>
            <small>{user?.roles.join(" · ") ?? "SUPER_ADMIN"}</small>
          </div>
          <button
            type="button"
            className="ftz-profile-menu"
            onClick={() => void logout()}
            disabled={loggingOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <i className="iconoir-nav-arrow-down" />
          </button>
        </div>
      </div>
    </header>
  );
}
