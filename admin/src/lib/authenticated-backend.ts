import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  type AuthResponse,
  clearAuthCookies,
  isAuthResponse,
  isCrossSiteRequest,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/auth";
import { backendFetch, readJson } from "@/lib/backend";

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
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function rejectSession(): NextResponse {
  const response = NextResponse.json(
    { message: "Session expired." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
  clearAuthCookies(response);
  return response;
}

export async function proxyAuthenticatedRequest(
  request: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site authenticated requests are not allowed." },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  const invoke = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return backendFetch(path, { ...init, headers });
  };

  try {
    if (accessToken) {
      const backendResponse = await invoke(accessToken);
      if (backendResponse.status !== 401) {
        return mirrorBackendResponse(backendResponse);
      }
    }

    if (!refreshToken) return rejectSession();

    const refreshResponse = await backendFetch("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshPayload = await readJson(refreshResponse);

    if (!refreshResponse.ok || !isAuthResponse(refreshPayload)) {
      return rejectSession();
    }

    const auth: AuthResponse = refreshPayload;
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
      { message: "Authenticated API is temporarily unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
