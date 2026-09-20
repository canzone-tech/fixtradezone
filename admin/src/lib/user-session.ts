import type { AdminUser } from "@/lib/auth";

export type ImpersonationAccessMode = "FULL" | "LIMITED";

export type UserProfileRequiredField =
  | "FIRST_NAME"
  | "LAST_NAME"
  | "MOBILE_NUMBER"
  | "WITHDRAWAL_ADDRESS";

export interface UserProfileCompletion {
  complete: boolean;
  missingFields: UserProfileRequiredField[];
  emailVerified: boolean;
  requiredFields: UserProfileRequiredField[];
  withdrawal: {
    asset: "USDT";
    networkCode: "BEP20";
    networkDisplayName: string;
    validationProfile: "EVM";
    address: string | null;
    savedAt: string | null;
    lockedUntil: string | null;
    canChange: boolean;
    lockDays: number;
  };
}

export interface UserDirectSession {
  user: AdminUser;

  sessionPolicy: {
    idleLockMinutes: number;
  };

  profileCompletion: UserProfileCompletion | null;
}

export interface UserImpersonationSession {
  user: AdminUser;

  impersonation: {
    id: string;
    startedAt: string;
    expiresAt: string;
    accessMode: ImpersonationAccessMode;

    actor: {
      id: string;
      email: string;
    };
  };

  sessionPolicy: {
    idleLockMinutes: number;
  };
}

export type UserPortalSession = UserDirectSession | UserImpersonationSession;

export function isImpersonationSession(
  session: UserPortalSession,
): session is UserImpersonationSession {
  return (
    "impersonation" in session &&
    typeof session.impersonation === "object" &&
    session.impersonation !== null
  );
}
