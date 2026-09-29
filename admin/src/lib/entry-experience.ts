const APP_INSTALLED_KEY = "ftz:app-installed";
const AUTHENTICATED_DEVICE_KEY = "ftz:authenticated-device";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Browser storage is an optional UX hint only.
  }
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function markAppInstalled(): void {
  writeFlag(APP_INSTALLED_KEY);
}

export function hasInstalledAppExperience(): boolean {
  return isStandaloneApp() || readFlag(APP_INSTALLED_KEY);
}

export function markAuthenticatedDeviceExperience(): void {
  writeFlag(AUTHENTICATED_DEVICE_KEY);
}

export function hasAuthenticatedDeviceExperience(): boolean {
  return readFlag(AUTHENTICATED_DEVICE_KEY);
}
