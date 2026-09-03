"use client";

const DATABASE_NAME = "fixtradezone-device";
const DATABASE_VERSION = 1;
const STORE_NAME = "installation";
const INSTALLATION_KEY = "deviceInstallationId";
const FALLBACK_STORAGE_KEY = "ftz.deviceInstallationId";

function isUuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function newInstallationId(): string {
  return crypto.randomUUID().toLowerCase();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed."));
  });
}

async function readIndexedDb(): Promise<string | null> {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(INSTALLATION_KEY);

      request.onsuccess = () =>
        resolve(isUuidV4(request.result) ? request.result.toLowerCase() : null);
      request.onerror = () =>
        reject(request.error ?? new Error("Device installation read failed."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDb(value: string): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, INSTALLATION_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Device installation write failed."));
    });
  } finally {
    database.close();
  }
}

function readFallback(): string | null {
  try {
    const value = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    return isUuidV4(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeFallback(value: string): void {
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, value);
  } catch {
    // The installation ID is a risk signal, not an authentication secret.
    // Registration remains usable if browser storage is unavailable.
  }
}

export async function getOrCreateDeviceInstallationId(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Device installation ID is only available in the browser.");
  }

  if (typeof indexedDB !== "undefined") {
    try {
      const existing = await readIndexedDb();
      if (existing) {
        writeFallback(existing);
        return existing;
      }

      const fallback = readFallback();
      if (fallback) {
        await writeIndexedDb(fallback);
        return fallback;
      }

      const created = newInstallationId();
      await writeIndexedDb(created);
      writeFallback(created);
      return created;
    } catch {
      // Continue with localStorage fallback for browsers where IndexedDB is
      // unavailable or blocked.
    }
  }

  const existing = readFallback();
  if (existing) return existing;

  const created = newInstallationId();
  writeFallback(created);
  return created;
}
