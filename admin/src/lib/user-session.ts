import type { AdminUser } from "@/lib/auth";

export type ImpersonationAccessMode = "FULL" | "LIMITED";

export interface UserDirectSession {
  user: AdminUser;

  sessionPolicy: {
    idleLockMinutes: number;
  };
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
