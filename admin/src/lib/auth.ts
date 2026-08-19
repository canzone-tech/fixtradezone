import { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "ftz_admin_access";
export const REFRESH_COOKIE = "ftz_admin_refresh";

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
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

export function isAuthResponse(payload: unknown): payload is AuthResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const auth = payload as Record<string, unknown>;
  const user = auth.user;

  if (typeof user !== "object" || user === null) {
    return false;
  }

  const candidate = user as Record<string, unknown>;

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
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.lastLoginAt === null ||
      typeof candidate.lastLoginAt === "string") &&
    Array.isArray(candidate.roles) &&
    candidate.roles.every((role) => typeof role === "string") &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every((permission) => typeof permission === "string")
  );
}

export function isAdministrator(user: AdminUser): boolean {
  return user.status === "ACTIVE" && user.roles.includes("ADMIN");
}

export function isCrossSiteRequest(request: NextRequest): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

export function setAuthCookies(
  response: NextResponse,
  payload: AuthResponse,
): void {
  const shared = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };

  response.cookies.set(ACCESS_COOKIE, payload.accessToken, {
    ...shared,
    maxAge: payload.expiresIn,
  });
  response.cookies.set(REFRESH_COOKIE, payload.refreshToken, {
    ...shared,
    maxAge: payload.refreshExpiresIn,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
