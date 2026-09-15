export const SITE_MODE_CHANGED_EVENT = "ftz:site-mode-changed";

export type SiteMode = "LIVE" | "TESTING" | "MAINTENANCE";
export type OperationsMode = "AUTOMATIC" | "CONTROLLED_MANUAL";

export interface PublicSiteModeStatus {
  siteMode: SiteMode;
  operationsMode: OperationsMode;
  message: string | null;
  launchAt: string | null;
  serverTime: string;
  publicApplicationAvailable: boolean;
  registrationEnabled: boolean;
  loginAccess:
    | "PUBLIC"
    | "TESTERS_AND_SUPER_ADMIN"
    | "SUPER_ADMIN_ONLY";
}

export interface AdminSiteModeStatus {
  platformTimezone: string;
  operationsMode: OperationsMode;
  siteMode: SiteMode;
  modeMessage: string | null;
  launchAt: string | null;
  recoveryUnlockedUntil: string | null;
  recoveryReason: string | null;
  updatedAt: string | null;
  recoveryActive: boolean;
  testerCount: number;
  message?: string;
}

export interface SiteModeTester {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isPublicSiteModeStatus(
  value: unknown,
): value is PublicSiteModeStatus {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PublicSiteModeStatus>;

  return (
    (candidate.siteMode === "LIVE" ||
      candidate.siteMode === "TESTING" ||
      candidate.siteMode === "MAINTENANCE") &&
    (candidate.operationsMode === "AUTOMATIC" ||
      candidate.operationsMode === "CONTROLLED_MANUAL") &&
    (candidate.message === null || typeof candidate.message === "string") &&
    (candidate.launchAt === null || typeof candidate.launchAt === "string") &&
    typeof candidate.serverTime === "string" &&
    typeof candidate.publicApplicationAvailable === "boolean" &&
    typeof candidate.registrationEnabled === "boolean" &&
    (candidate.loginAccess === "PUBLIC" ||
      candidate.loginAccess === "TESTERS_AND_SUPER_ADMIN" ||
      candidate.loginAccess === "SUPER_ADMIN_ONLY")
  );
}

export function notifySiteModeChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SITE_MODE_CHANGED_EVENT));
  }
}
