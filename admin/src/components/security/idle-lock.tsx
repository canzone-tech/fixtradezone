"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./idle-lock.module.css";

interface IdleLockProps {
  idleLockMinutes: number;
  enabled?: boolean;
  scopeKey: string;
}

interface ApiMessage {
  message?: string;
  reauthenticated?: boolean;
}

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

export default function IdleLock({
  idleLockMinutes,
  enabled = true,
  scopeKey,
}: IdleLockProps) {
  const [locked, setLocked] = useState(false);

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [unlocking, setUnlocking] = useState(false);

  const lastActivityRef = useRef<number | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);

  const storageKey = `ftz:last-activity:${scopeKey}`;

  const timeoutMs = Math.max(1, idleLockMinutes) * 60 * 1000;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const now = Date.now();

    try {
      const stored = Number(window.localStorage.getItem(storageKey));

      if (Number.isFinite(stored) && stored > 0 && now - stored < timeoutMs) {
        lastActivityRef.current = stored;
      } else {
        lastActivityRef.current = now;

        window.localStorage.setItem(storageKey, String(now));
      }
    } catch {
      lastActivityRef.current = now;
    }

    const recordActivity = () => {
      if (locked) {
        return;
      }

      const activityAt = Date.now();

      lastActivityRef.current = activityAt;

      try {
        window.localStorage.setItem(storageKey, String(activityAt));
      } catch {
        // Storage is optional.
      }
    };

    const evaluateIdleState = () => {
      if (locked) {
        return;
      }

      const lastActivity = lastActivityRef.current;

      if (lastActivity !== null && Date.now() - lastActivity >= timeoutMs) {
        setLocked(true);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) {
        return;
      }

      const timestamp = Number(event.newValue);

      if (Number.isFinite(timestamp) && timestamp > 0) {
        lastActivityRef.current = timestamp;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        evaluateIdleState();
      }
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, {
        passive: true,
      });
    }

    window.addEventListener("storage", onStorage);

    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = window.setInterval(evaluateIdleState, 1000);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, recordActivity);
      }

      window.removeEventListener("storage", onStorage);

      document.removeEventListener("visibilitychange", onVisibilityChange);

      window.clearInterval(interval);
    };
  }, [enabled, locked, storageKey, timeoutMs]);

  useEffect(() => {
    if (!locked) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      passwordRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password) {
      setError("Enter your password to unlock.");
      return;
    }

    setUnlocking(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ApiMessage;

      if (!response.ok) {
        if (payload.message === "Session expired.") {
          window.location.replace("/login");
          return;
        }

        throw new Error(payload.message || "Password verification failed.");
      }

      if (payload.reauthenticated !== true) {
        throw new Error("Unable to verify the current session.");
      }

      const now = Date.now();

      lastActivityRef.current = now;

      try {
        window.localStorage.setItem(storageKey, String(now));
      } catch {
        // Storage is optional.
      }

      setPassword("");
      setError("");
      setLocked(false);
    } catch (caught) {
      setPassword("");

      setError(
        caught instanceof Error ? caught.message : "Unable to unlock session.",
      );

      window.setTimeout(() => {
        passwordRef.current?.focus();
      }, 0);
    } finally {
      setUnlocking(false);
    }
  }

  if (!enabled || !locked) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ftz-lock-title"
    >
      <div className={styles.panel}>
        <div className={styles.lockIcon}>
          <i className="iconoir-lock" />
        </div>

        <div className={styles.heading}>
          <span>SECURE SESSION LOCK</span>

          <h2 id="ftz-lock-title">Session Locked</h2>

          <p>
            Your session was locked after {idleLockMinutes} minute
            {idleLockMinutes === 1 ? "" : "s"} of inactivity.
          </p>
        </div>

        <form className={styles.form} onSubmit={unlock}>
          <label>
            <span>Password</span>

            <div className={styles.passwordField}>
              <i className="iconoir-key" />

              <input
                ref={passwordRef}
                type="password"
                value={password}
                autoComplete="current-password"
                disabled={unlocking}
                placeholder="Enter password"
                onChange={(event) => {
                  setPassword(event.target.value);

                  if (error) {
                    setError("");
                  }
                }}
              />
            </div>
          </label>

          {error ? (
            <div className={styles.error} role="alert">
              <i className="iconoir-warning-circle" />
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" disabled={unlocking}>
            <i className="iconoir-unlock" />

            {unlocking ? "Verifying..." : "Unlock Session"}
          </button>
        </form>

        <div className={styles.securityNote}>
          <i className="iconoir-shield-check" />

          <span>Your current page and state are preserved.</span>
        </div>
      </div>
    </div>
  );
}
