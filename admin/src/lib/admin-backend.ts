import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  type AuthResponse,
  clearAuthCookies,
  isAdministrator,
  isAuthResponse,
  isCrossSiteRequest,
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
  const contentType = backendResponse.headers.get("content-type") ?? "";

  if (
    backendResponse.ok &&
    contentType &&
    !contentType.toLowerCase().includes("application/json")
  ) {
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    for (const name of [
      "content-type",
      "content-disposition",
      "content-length",
      "x-content-type-options",
    ]) {
      const value = backendResponse.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new NextResponse(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers,
    });
  }

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

function rejectSession(status = 401): NextResponse {
  const response = NextResponse.json(
    {
      message:
        status === 403
          ? "Administrator access is required."
          : "Session expired.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  clearAuthCookies(response);

  return response;
}

export async function proxyAdminRequest(
  request: NextRequest,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      {
        message: "Cross-site admin requests are not allowed.",
      },
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
    const headers = forwardedBackendHeaders(request, init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    return backendFetch(path, {
      ...init,
      headers,
    });
  };

  try {
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

    if (!isAdministrator(auth.user)) {
      await backendFetch("/auth/logout", {
        method: "POST",
        headers: forwardedBackendHeaders(request, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }).catch(() => undefined);

      return rejectSession(403);
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
      { message: "Admin API is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
