export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export interface ImpersonationTokenPayload {
  sub: string;
  type: 'impersonation';
  iid: string;
  act: string;
  asid: string;
}

export interface PasswordChangeTokenPayload {
  sub: string;
  type: 'password_change';
  jti: string;
}
