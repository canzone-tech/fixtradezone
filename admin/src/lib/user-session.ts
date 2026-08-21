import type { AdminUser } from "@/lib/auth";

export type ImpersonationAccessMode = "FULL" | "LIMITED";

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
