import { NextRequest, NextResponse } from "next/server";
import {
  clearImpersonationCookies,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/lib/admin-impersonation";
import {
  ACCESS_COOKIE,
  type AuthResponse,
  clearAuthCookies,
  isAdministrator,
  isAuthResponse,
  isCrossSiteRequest,
  isStandardUser,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/auth";
import {
  backendFetch,
  forwardedBackendHeaders,
  readJson,
} from "@/lib/backend";

async function mirrorBackendResponse(
  backendResponse: Response,
): Promise<NextResponse> {
  const payload = await readJson(backendResponse);

  return NextResponse.json(
    payload ?? {
      message: backendResponse.ok
        ? "Request completed."
        : "Backend request failed.",
    },
    {
      status: backendResponse.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function rejectSession(status = 401, redirectTo = "/login"): NextResponse {
  const response = NextResponse.json(
    {
      message:
        status === 403
          ? "Standard USER access is required."
          : "Session expired.",
      redirectTo,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );

  if (status === 401) {
    clearAuthCookies(response);
  }

  return response;
}

export async function proxyUserRequest(
  request: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site USER requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const impersonationToken = request.cookies.get(
    IMPERSONATION_TOKEN_COOKIE,
  )?.value;

  const invoke = (token: string) => {
    const headers = forwardedBackendHeaders(request, init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    return backendFetch(path, { ...init, headers });
  };

  try {
    if (impersonationToken) {
      const backendResponse = await invoke(impersonationToken);
      const response = await mirrorBackendResponse(backendResponse);

      if (backendResponse.status === 401) {
        clearImpersonationCookies(response);
      }

      return response;
    }

    if (accessToken) {
      const backendResponse = await invoke(accessToken);

      if (backendResponse.status !== 401) {
        return mirrorBackendResponse(backendResponse);
      }
    }

    if (!refreshToken) {
      return rejectSession();
    }

    const refreshResponse = await backendFetch("/auth/refresh", {
      method: "POST",
      headers: forwardedBackendHeaders(request, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ refreshToken }),
    });

    const refreshPayload = await readJson(refreshResponse);

    if (!refreshResponse.ok || !isAuthResponse(refreshPayload)) {
      return rejectSession();
    }

    const auth: AuthResponse = refreshPayload;

    if (!isStandardUser(auth.user)) {
      const response = rejectSession(
        403,
        isAdministrator(auth.user) ? "/dashboard" : "/login",
      );

      setAuthCookies(response, auth);
      return response;
    }

    const backendResponse = await invoke(auth.accessToken);
    const response = await mirrorBackendResponse(backendResponse);

    if (backendResponse.status === 401) {
      clearAuthCookies(response);
      return response;
    }

    setAuthCookies(response, auth);
    return response;
  } catch {
    return NextResponse.json(
      { message: "USER API is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
