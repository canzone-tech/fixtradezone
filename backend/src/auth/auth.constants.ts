export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const IMPERSONATION_TOKEN_TTL_SECONDS = 30 * 60;

export const JWT_ACCESS_AUDIENCE = 'fixtradezone-clients';
export const JWT_ACCESS_ISSUER = 'fixtradezone-api';
export const JWT_REFRESH_AUDIENCE = 'fixtradezone-sessions';
export const JWT_REFRESH_ISSUER = 'fixtradezone-api';

export const JWT_IMPERSONATION_AUDIENCE = 'fixtradezone-user-impersonation';
export const JWT_IMPERSONATION_ISSUER = 'fixtradezone-api';

export const DEFAULT_USER_ROLE_NAME = 'USER';
export const DEFAULT_USER_ROLE_DESCRIPTION = 'Standard FixTradeZone user role';

export const ADMIN_ROLE_NAME = 'ADMIN';
export const ADMIN_ROLE_DESCRIPTION = 'FixTradeZone administrator role';

export const SUPER_ADMIN_ROLE_NAME = 'SUPER_ADMIN';
export const SUPER_ADMIN_ROLE_DESCRIPTION =
  'FixTradeZone founder and highest-authority administrator role';

export const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
export const GENERIC_SESSION_ERROR = 'Invalid or expired session.';
export const GENERIC_IMPERSONATION_ERROR =
  'Invalid or expired impersonation session.';
