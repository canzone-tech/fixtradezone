export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  type: 'refresh';
  jti: string;
}
