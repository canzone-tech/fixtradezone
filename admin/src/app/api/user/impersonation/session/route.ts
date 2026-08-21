import { NextRequest, NextResponse } from "next/server";
import {
  clearImpersonationCookies,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/lib/admin-impersonation";
import {
  ACCESS_COOKIE,
  type AdminUser,
  isCrossSiteRequest,
  REFRESH_COOKIE,
} from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface ImpersonationSessionPayload {
  user: AdminUser;
  impersonation: {
    id: string;
    startedAt: string;
    expiresAt: string;
    actor: {
      id: string;
      email: string;
    };
  };
}

function isImpersonationSessionPayload(
  value: unknown,
): value is ImpersonationSessionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  const user = payload.user;
  const impersonation = payload.impersonation;

  if (
    typeof user !== "object" ||
    user === null ||
    typeof impersonation !== "object" ||
    impersonation === null
  ) {
    return false;
  }

  const subject = user as Record<string, unknown>;

  const session = impersonation as Record<string, unknown>;

  const actor = session.actor;

  return (
    typeof subject.id === "string" &&
    typeof subject.email === "string" &&
    subject.status === "ACTIVE" &&
    Array.isArray(subject.roles) &&
    subject.roles.includes("USER") &&
    !subject.roles.includes("ADMIN") &&
    !subject.roles.includes("SUPER_ADMIN") &&
    typeof session.id === "string" &&
    typeof session.startedAt === "string" &&
    typeof session.expiresAt === "string" &&
    typeof actor === "object" &&
    actor !== null &&
    typeof (actor as Record<string, unknown>).id === "string" &&
    typeof (actor as Record<string, unknown>).email === "string"
  );
}

export async function GET(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      {
        message: "Cross-site impersonation requests are not allowed.",
      },
      { status: 403 },
    );
  }

  const hasAdminSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  const token = request.cookies.get(IMPERSONATION_TOKEN_COOKIE)?.value;

  if (!hasAdminSession || !token) {
    const response = NextResponse.json(
      {
        message: "No active user impersonation session.",
      },
      { status: 401 },
    );

    clearImpersonationCookies(response);

    return response;
  }

  try {
    const backendResponse = await backendFetch("/user/impersonation/session", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await readJson(backendResponse);

    if (!backendResponse.ok) {
      const response = NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to validate impersonation session.",
          ),
        },
        {
          status: backendResponse.status,
        },
      );

      if (backendResponse.status === 401) {
        clearImpersonationCookies(response);
      }

      return response;
    }

    if (!isImpersonationSessionPayload(payload)) {
      const response = NextResponse.json(
        {
          message: "Impersonation service returned an invalid session.",
        },
        { status: 502 },
      );

      clearImpersonationCookies(response);

      return response;
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        message: "Impersonation service is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
