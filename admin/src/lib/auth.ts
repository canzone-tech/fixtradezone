import { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "ftz_admin_access";
export const REFRESH_COOKIE = "ftz_admin_refresh";
export const PASSWORD_CHANGE_COOKIE = "ftz_password_change";

export type PortalRedirectPath = "/dashboard" | "/user/dashboard";

export interface AdminUser {
  id: string;
  email: string | null;
  username: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "PENDING";
  createdAt: string;
  lastLoginAt: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  message: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

export interface PasswordChangeRequiredResponse {
  message: string;
  passwordChangeRequired: true;
  passwordChangeToken: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
  };
}

export function isAdminUser(payload: unknown): payload is AdminUser {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    (candidate.email === null || typeof candidate.email === "string") &&
    typeof candidate.username === "string" &&
    (candidate.phone === null || typeof candidate.phone === "string") &&
    (candidate.firstName === null || typeof candidate.firstName === "string") &&
    (candidate.lastName === null || typeof candidate.lastName === "string") &&
    typeof candidate.status === "string" &&
    ["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING"].includes(candidate.status) &&
    typeof candidate.createdAt === "string" &&
    (candidate.lastLoginAt === null ||
      typeof candidate.lastLoginAt === "string") &&
    Array.isArray(candidate.roles) &&
    candidate.roles.every((role) => typeof role === "string") &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every((permission) => typeof permission === "string")
  );
}

export function isAuthResponse(payload: unknown): payload is AuthResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const auth = payload as Record<string, unknown>;

  return (
    typeof auth.message === "string" &&
    auth.tokenType === "Bearer" &&
    typeof auth.accessToken === "string" &&
    auth.accessToken.length > 0 &&
    typeof auth.refreshToken === "string" &&
    auth.refreshToken.length > 0 &&
    typeof auth.expiresIn === "number" &&
    Number.isSafeInteger(auth.expiresIn) &&
    auth.expiresIn > 0 &&
    typeof auth.refreshExpiresIn === "number" &&
    Number.isSafeInteger(auth.refreshExpiresIn) &&
    auth.refreshExpiresIn > 0 &&
    isAdminUser(auth.user)
  );
}

export function isPasswordChangeRequiredResponse(
  payload: unknown,
): payload is PasswordChangeRequiredResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const response = payload as Record<string, unknown>;
  const user = response.user;

  if (typeof user !== "object" || user === null) {
    return false;
  }

  const candidate = user as Record<string, unknown>;

  return (
    response.passwordChangeRequired === true &&
    typeof response.message === "string" &&
    typeof response.passwordChangeToken === "string" &&
    response.passwordChangeToken.length > 0 &&
    typeof response.expiresIn === "number" &&
    Number.isSafeInteger(response.expiresIn) &&
    response.expiresIn > 0 &&
    typeof candidate.id === "string" &&
    typeof candidate.username === "string"
  );
}

export function isAdministrator(user: AdminUser): boolean {
  return (
    user.status === "ACTIVE" &&
    (user.roles.includes("SUPER_ADMIN") || user.roles.includes("ADMIN"))
  );
}

export function isStandardUser(user: AdminUser): boolean {
  return (
    user.status === "ACTIVE" &&
    user.roles.includes("USER") &&
    !user.roles.includes("SUPER_ADMIN") &&
    !user.roles.includes("ADMIN")
  );
}

export function getPortalRedirect(user: AdminUser): PortalRedirectPath | null {
  if (isAdministrator(user)) {
    return "/dashboard";
  }

  if (isStandardUser(user)) {
    return "/user/dashboard";
  }

  return null;
}

export function isCrossSiteRequest(request: NextRequest): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

function sharedCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}

export function setAuthCookies(
  response: NextResponse,
  payload: AuthResponse,
): void {
  const shared = sharedCookieOptions();

  response.cookies.set(ACCESS_COOKIE, payload.accessToken, {
    ...shared,
    maxAge: payload.expiresIn,
  });

  response.cookies.set(REFRESH_COOKIE, payload.refreshToken, {
    ...shared,
    maxAge: payload.refreshExpiresIn,
  });

  clearPasswordChangeCookie(response);
}

export function setPasswordChangeCookie(
  response: NextResponse,
  payload: PasswordChangeRequiredResponse,
): void {
  response.cookies.set(PASSWORD_CHANGE_COOKIE, payload.passwordChangeToken, {
    ...sharedCookieOptions(),
    maxAge: payload.expiresIn,
  });
}

export function clearPasswordChangeCookie(response: NextResponse): void {
  response.cookies.set(PASSWORD_CHANGE_COOKIE, "", {
    ...sharedCookieOptions(),
    maxAge: 0,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  const shared = sharedCookieOptions();

  response.cookies.set(ACCESS_COOKIE, "", {
    ...shared,
    maxAge: 0,
  });

  response.cookies.set(REFRESH_COOKIE, "", {
    ...shared,
    maxAge: 0,
  });

  clearPasswordChangeCookie(response);
}
