"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { sessionLockStorageKeys } from "@/lib/session-lock-client";
import styles from "./idle-lock.module.css";

interface IdleLockProps {
  idleLockMinutes: number;
  enabled?: boolean;
  scopeKey: string;
  identityLabel?: string | null;
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
  identityLabel,
}: IdleLockProps) {
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const lastActivityRef = useRef<number | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { activityKey, lockKey } = sessionLockStorageKeys(scopeKey);
  const timeoutMs = Math.max(1, idleLockMinutes) * 60 * 1000;

  useEffect(() => {
    if (!enabled) return;

    const persistLocked = () => {
      try {
        window.localStorage.setItem(lockKey, "1");
      } catch {
        // Browser storage is optional.
      }
      setLocked(true);
    };

    const now = Date.now();

    try {
      const storedLock = window.localStorage.getItem(lockKey);
      const storedActivity = Number(window.localStorage.getItem(activityKey));

      if (storedLock === "1") {
        lastActivityRef.current =
          Number.isFinite(storedActivity) && storedActivity > 0
            ? storedActivity
            : null;
        window.setTimeout(() => {
          setLocked(true);
        }, 0);
      } else if (Number.isFinite(storedActivity) && storedActivity > 0) {
        lastActivityRef.current = storedActivity;

        if (now - storedActivity >= timeoutMs) {
          persistLocked();
        }
      } else {
        lastActivityRef.current = now;
        window.localStorage.setItem(activityKey, String(now));
      }
    } catch {
      lastActivityRef.current = now;
    }

    const recordActivity = () => {
      if (locked) return;

      const activityAt = Date.now();
      lastActivityRef.current = activityAt;

      try {
        window.localStorage.setItem(activityKey, String(activityAt));
      } catch {
        // Browser storage is optional.
      }
    };

    const evaluateIdleState = () => {
      if (locked) return;

      const lastActivity = lastActivityRef.current;
      if (lastActivity !== null && Date.now() - lastActivity >= timeoutMs) {
        persistLocked();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === lockKey) {
        if (event.newValue === "1") {
          setLocked(true);
        } else if (event.newValue === null) {
          setLocked(false);
        }
        return;
      }

      if (event.key !== activityKey || !event.newValue) return;

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
      window.addEventListener(eventName, recordActivity, { passive: true });
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
  }, [activityKey, enabled, lockKey, locked, timeoutMs]);

  useEffect(() => {
    if (!locked) return;

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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
        window.localStorage.setItem(activityKey, String(now));
        window.localStorage.removeItem(lockKey);
      } catch {
        // Browser storage is optional.
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

  if (!enabled || !locked) return null;

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
          {identityLabel ? <p>Signed in as {identityLabel}</p> : null}
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
                  if (error) setError("");
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
