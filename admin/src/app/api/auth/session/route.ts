import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  type AdminUser,
  type AuthResponse,
  clearAuthCookies,
  isAuthResponse,
  isAdministrator,
  isCrossSiteRequest,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/auth";
import { backendFetch, readJson } from "@/lib/backend";

function rejectSession(status = 401): NextResponse {
  const response = NextResponse.json(
    {
      message:
        status === 403
          ? "Administrator access is required."
          : "Session expired.",
    },
    { status },
  );
  clearAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site session requests are not allowed." },
      { status: 403 },
    );
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  try {
    if (accessToken) {
      const profileResponse = await backendFetch("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (profileResponse.ok) {
        const profile = (await readJson(profileResponse)) as {
          user?: AdminUser;
        };

        if (!profile.user || !isAdministrator(profile.user)) {
          if (refreshToken) {
            await backendFetch("/auth/logout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken }),
            }).catch(() => undefined);
          }
          return rejectSession(403);
        }

        return NextResponse.json({ user: profile.user });
      }

      if (profileResponse.status !== 401) {
        return NextResponse.json(
          { message: "Unable to validate the current session." },
          { status: 502 },
        );
      }
    }

    if (!refreshToken) {
      return rejectSession();
    }

    const refreshResponse = await backendFetch("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await readJson(refreshResponse);

    if (!refreshResponse.ok) {
      return rejectSession();
    }

    if (!isAuthResponse(payload)) {
      return rejectSession();
    }

    const auth: AuthResponse = payload;

    if (!auth.user || !isAdministrator(auth.user)) {
      if (auth.refreshToken) {
        await backendFetch("/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: auth.refreshToken }),
        }).catch(() => undefined);
      }
      return rejectSession(403);
    }

    const response = NextResponse.json({ user: auth.user });
    setAuthCookies(response, auth);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Authentication service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
