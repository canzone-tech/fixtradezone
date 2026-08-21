import { NextRequest, NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth";

export const IMPERSONATION_TOKEN_COOKIE = "ftz_admin_impersonation";

export const IMPERSONATION_CONTEXT_COOKIE = "ftz_admin_impersonation_context";

export interface ImpersonationContext {
  id: string;
  startedAt: string;
  expiresAt: string;
  actor: {
    id: string;
    email: string;
  };
  subject: AdminUser;
}

export interface ImpersonationStartPayload {
  message: string;
  tokenType: "Bearer";
  impersonationToken: string;
  expiresIn: number;
  impersonation: ImpersonationContext;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isAdminUser(value: unknown): value is AdminUser {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const user = value as Record<string, unknown>;

  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    (typeof user.username === "string" || user.username === null) &&
    (typeof user.phone === "string" || user.phone === null) &&
    (typeof user.firstName === "string" || user.firstName === null) &&
    (typeof user.lastName === "string" || user.lastName === null) &&
    typeof user.status === "string" &&
    typeof user.createdAt === "string" &&
    (typeof user.lastLoginAt === "string" || user.lastLoginAt === null) &&
    isStringArray(user.roles) &&
    isStringArray(user.permissions)
  );
}

export function isImpersonationStartPayload(
  value: unknown,
): value is ImpersonationStartPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  if (
    typeof payload.message !== "string" ||
    payload.tokenType !== "Bearer" ||
    typeof payload.impersonationToken !== "string" ||
    payload.impersonationToken.length === 0 ||
    typeof payload.expiresIn !== "number" ||
    !Number.isSafeInteger(payload.expiresIn) ||
    payload.expiresIn <= 0 ||
    typeof payload.impersonation !== "object" ||
    payload.impersonation === null
  ) {
    return false;
  }

  const session = payload.impersonation as Record<string, unknown>;

  if (
    typeof session.id !== "string" ||
    typeof session.startedAt !== "string" ||
    typeof session.expiresAt !== "string" ||
    typeof session.actor !== "object" ||
    session.actor === null ||
    !isAdminUser(session.subject)
  ) {
    return false;
  }

  const actor = session.actor as Record<string, unknown>;

  return typeof actor.id === "string" && typeof actor.email === "string";
}

export function setImpersonationCookies(
  response: NextResponse,
  payload: ImpersonationStartPayload,
): void {
  const shared = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: payload.expiresIn,
  };

  response.cookies.set(
    IMPERSONATION_TOKEN_COOKIE,
    payload.impersonationToken,
    shared,
  );

  response.cookies.set(
    IMPERSONATION_CONTEXT_COOKIE,
    encodeURIComponent(JSON.stringify(payload.impersonation)),
    shared,
  );
}

export function clearImpersonationCookies(response: NextResponse): void {
  const expired = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(IMPERSONATION_TOKEN_COOKIE, "", expired);

  response.cookies.set(IMPERSONATION_CONTEXT_COOKIE, "", expired);
}

export function getImpersonationContext(
  request: NextRequest,
): ImpersonationContext | null {
  const raw = request.cookies.get(IMPERSONATION_CONTEXT_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const decoded = JSON.parse(decodeURIComponent(raw)) as unknown;

    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }

    const context = decoded as Record<string, unknown>;

    if (
      typeof context.id !== "string" ||
      typeof context.startedAt !== "string" ||
      typeof context.expiresAt !== "string" ||
      typeof context.actor !== "object" ||
      context.actor === null ||
      !isAdminUser(context.subject)
    ) {
      return null;
    }

    const actor = context.actor as Record<string, unknown>;

    if (typeof actor.id !== "string" || typeof actor.email !== "string") {
      return null;
    }

    return decoded as ImpersonationContext;
  } catch {
    return null;
  }
}

export function copyResponseCookies(
  source: NextResponse,
  target: NextResponse,
): void {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}
