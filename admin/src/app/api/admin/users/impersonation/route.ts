import { NextRequest, NextResponse } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";
import {
  clearImpersonationCookies,
  getImpersonationContext,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/lib/admin-impersonation";
import { ACCESS_COOKIE, isCrossSiteRequest, REFRESH_COOKIE } from "@/lib/auth";

export function GET(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      {
        message: "Cross-site admin requests are not allowed.",
      },
      { status: 403 },
    );
  }

  const hasAdminSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  if (!hasAdminSession) {
    return NextResponse.json(
      {
        message: "Session expired.",
      },
      { status: 401 },
    );
  }

  const impersonation = getImpersonationContext(request);
  const hasImpersonationToken = request.cookies.has(IMPERSONATION_TOKEN_COOKIE);
  const expiresAt = impersonation ? Date.parse(impersonation.expiresAt) : NaN;
  const active =
    impersonation !== null &&
    hasImpersonationToken &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now();

  const response = NextResponse.json(
    {
      active,
      impersonation: active ? impersonation : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  if (!active && (impersonation !== null || hasImpersonationToken)) {
    clearImpersonationCookies(response);
  }

  return response;
}

export async function DELETE(request: NextRequest) {
  const response = await proxyAdminRequest(
    request,
    "/admin/users/impersonation",
    {
      method: "DELETE",
    },
  );

  if (response.ok || response.status === 401 || response.status === 404) {
    clearImpersonationCookies(response);
  }

  return response;
}
