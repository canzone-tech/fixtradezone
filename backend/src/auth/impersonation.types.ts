import type { AuthenticatedUser } from './auth-user';

export type ImpersonationAccessMode = 'FULL' | 'LIMITED';

export interface ImpersonationPrincipal {
  user: AuthenticatedUser;
  impersonation: {
    id: string;
    startedAt: Date;
    expiresAt: Date;
    actor: {
      id: string;
      email: string | null;
    };
  };
}

export interface ImpersonationSessionView {
  user: AuthenticatedUser;
  impersonation: ImpersonationPrincipal['impersonation'] & {
    accessMode: ImpersonationAccessMode;
  };
  sessionPolicy: {
    idleLockMinutes: number;
  };
}
