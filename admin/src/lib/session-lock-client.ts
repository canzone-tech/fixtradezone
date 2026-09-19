const ACTIVITY_STORAGE_PREFIX = "ftz:last-activity:";
const LOCK_STORAGE_PREFIX = "ftz:session-locked:";

export function sessionLockStorageKeys(scopeKey: string) {
  return {
    activityKey: `${ACTIVITY_STORAGE_PREFIX}${scopeKey}`,
    lockKey: `${LOCK_STORAGE_PREFIX}${scopeKey}`,
  };
}

export function clearSessionLockStorage(scopeKey?: string): void {
  if (typeof window === "undefined") return;

  try {
    if (scopeKey) {
      const { activityKey, lockKey } = sessionLockStorageKeys(scopeKey);
      window.localStorage.removeItem(activityKey);
      window.localStorage.removeItem(lockKey);
      return;
    }

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (
        key?.startsWith(ACTIVITY_STORAGE_PREFIX) ||
        key?.startsWith(LOCK_STORAGE_PREFIX)
      ) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Browser storage is optional. Server-side cookies remain authoritative.
  }
}
