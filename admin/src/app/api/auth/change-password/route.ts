import { NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_TOKEN_COOKIE } from "@/lib/admin-impersonation";
import {
  ACCESS_COOKIE,
  type AuthResponse,
  clearAuthCookies,
  isAuthResponse,
  isCrossSiteRequest,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

function invalidSession(): NextResponse {
  const response = NextResponse.json(
    { message: "Session expired." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
  clearAuthCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site password change requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (request.cookies.has(IMPERSONATION_TOKEN_COOKIE)) {
    return NextResponse.json(
      { message: "Password changes are disabled during impersonation." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let currentPassword: string;
  let newPassword: string;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.currentPassword !== "string" ||
      body.currentPassword.length < 1 ||
      body.currentPassword.length > 128 ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 12 ||
      body.newPassword.length > 128
    ) {
      throw new Error("Invalid password change request");
    }
    currentPassword = body.currentPassword;
    newPassword = body.newPassword;
  } catch {
    return NextResponse.json(
      { message: "Invalid password change request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const invoke = (token: string) =>
    backendFetch("/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

  try {
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    let backendResponse: Response | null = null;
    let refreshedAuth: AuthResponse | null = null;

    if (accessToken) {
      backendResponse = await invoke(accessToken);
      if (backendResponse.status !== 401) {
        const payload = await readJson(backendResponse);
        const response = NextResponse.json(
          payload ?? { message: "Password change request completed." },
          {
            status: backendResponse.status,
            headers: { "Cache-Control": "no-store" },
          },
        );
        if (backendResponse.ok) clearAuthCookies(response);
        return response;
      }
    }

    if (!refreshToken) return invalidSession();

    const refreshResponse = await backendFetch("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshPayload = await readJson(refreshResponse);
    if (!refreshResponse.ok || !isAuthResponse(refreshPayload)) {
      return invalidSession();
    }

    refreshedAuth = refreshPayload;
    backendResponse = await invoke(refreshedAuth.accessToken);
    const payload = await readJson(backendResponse);
    const response = NextResponse.json(
      payload ?? {
        message: backendResponse.ok
          ? "Password changed successfully."
          : "Unable to change password.",
      },
      {
        status: backendResponse.status,
        headers: { "Cache-Control": "no-store" },
      },
    );

    if (backendResponse.ok || backendResponse.status === 401) {
      clearAuthCookies(response);
    } else {
      setAuthCookies(response, refreshedAuth);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(error, "Password change service is unavailable."),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
