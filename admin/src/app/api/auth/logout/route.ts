import { NextRequest, NextResponse } from "next/server";
import {
  clearAuthCookies,
  isCrossSiteRequest,
  REFRESH_COOKIE,
} from "@/lib/auth";
import { clearImpersonationCookies } from "@/lib/admin-impersonation";
import { backendFetch } from "@/lib/backend";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site authentication requests are not allowed." },
      { status: 403 },
    );
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await backendFetch("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  const response = NextResponse.json({
    message: "Logout successful.",
  });

  clearImpersonationCookies(response);
  clearAuthCookies(response);

  return response;
}
