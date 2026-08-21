import { NextRequest, NextResponse } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";
import {
  clearImpersonationCookies,
  getImpersonationContext,
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

  return NextResponse.json(
    {
      active: impersonation !== null,
      impersonation,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function DELETE(request: NextRequest) {
  const response = await proxyAdminRequest(
    request,
    "/admin/users/impersonation",
    {
      method: "DELETE",
    },
  );

  if (response.ok) {
    clearImpersonationCookies(response);
  }

  return response;
}
