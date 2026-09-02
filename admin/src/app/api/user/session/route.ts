import { NextRequest, NextResponse } from "next/server";
import {
  clearImpersonationCookies,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/lib/admin-impersonation";
import {
  ACCESS_COOKIE,
  type AdminUser,
  type AuthResponse,
  clearAuthCookies,
  isAdminUser,
  isAdministrator,
  isAuthResponse,
  isCrossSiteRequest,
  isStandardUser,
  REFRESH_COOKIE,
  setAuthCookies,
} from "@/lib/auth";
import { backendFetch, readJson } from "@/lib/backend";

const DEFAULT_IDLE_LOCK_MINUTES = 5;

interface ProfilePayload {
  user?: AdminUser;
}

function sessionExpired(): NextResponse {
  const response = NextResponse.json(
    {
      message: "Session expired.",
      redirectTo: "/login",
    },
    { status: 401 },
  );

  clearAuthCookies(response);

  return response;
}

function roleRejected(user: AdminUser): NextResponse {
  return NextResponse.json(
    {
      message: "Standard USER access is required.",
      redirectTo: isAdministrator(user) ? "/dashboard" : "/login",
    },
    { status: 403 },
  );
}

function readIdleLockMinutes(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const root = payload as Record<string, unknown>;

  const direct = root.idleLockMinutes;

  if (
    typeof direct === "number" &&
    Number.isSafeInteger(direct) &&
    direct > 0 &&
    direct <= 1440
  ) {
    return direct;
  }

  for (const key of ["sessionPolicy", "policy"]) {
    const nested = root[key];

    if (typeof nested !== "object" || nested === null) {
      continue;
    }

    const value = (nested as Record<string, unknown>).idleLockMinutes;

    if (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 1440
    ) {
      return value;
    }
  }

  return null;
}

async function loadIdleLockMinutes(accessToken: string): Promise<number> {
  try {
    const response = await backendFetch("/auth/session-policy", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return DEFAULT_IDLE_LOCK_MINUTES;
    }

    const payload = await readJson(response);

    return readIdleLockMinutes(payload) ?? DEFAULT_IDLE_LOCK_MINUTES;
  } catch {
    return DEFAULT_IDLE_LOCK_MINUTES;
  }
}

async function createUserSessionResponse(
  user: AdminUser,
  accessToken: string,
): Promise<NextResponse> {
  const idleLockMinutes = await loadIdleLockMinutes(accessToken);

  return NextResponse.json(
    {
      user,
      sessionPolicy: {
        idleLockMinutes,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
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
  const impersonationToken = request.cookies.get(
    IMPERSONATION_TOKEN_COOKIE,
  )?.value;

  try {
    if (impersonationToken) {
      const impersonationResponse = await backendFetch(
        "/user/impersonation/session",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${impersonationToken}`,
          },
        },
      );

      const impersonationPayload = await readJson(impersonationResponse);

      const response = NextResponse.json(
        impersonationPayload ?? {
          message: impersonationResponse.ok
            ? "Impersonation session validated."
            : "Unable to validate impersonation session.",
        },
        {
          status: impersonationResponse.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );

      if (impersonationResponse.status === 401) {
        clearImpersonationCookies(response);
      }

      return response;
    }

    if (accessToken) {
      const profileResponse = await backendFetch("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (profileResponse.ok) {
        const payload = (await readJson(profileResponse)) as ProfilePayload;

        if (!payload.user || !isAdminUser(payload.user)) {
          return NextResponse.json(
            { message: "Authentication service returned an invalid profile." },
            { status: 502 },
          );
        }

        if (!isStandardUser(payload.user)) {
          return roleRejected(payload.user);
        }

        return createUserSessionResponse(payload.user, accessToken);
      }

      if (profileResponse.status !== 401) {
        return NextResponse.json(
          { message: "Unable to validate the current USER session." },
          { status: 502 },
        );
      }
    }

    if (!refreshToken) {
      return sessionExpired();
    }

    const refreshResponse = await backendFetch("/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    const payload = await readJson(refreshResponse);

    if (!refreshResponse.ok || !isAuthResponse(payload)) {
      return sessionExpired();
    }

    const auth: AuthResponse = payload;

    if (!isStandardUser(auth.user)) {
      const response = roleRejected(auth.user);

      // Refresh-token rotation already occurred. Preserve the newly issued
      // valid session instead of leaving the account with a consumed token.
      setAuthCookies(response, auth);

      return response;
    }

    const response = await createUserSessionResponse(
      auth.user,
      auth.accessToken,
    );

    setAuthCookies(response, auth);

    return response;
  } catch {
    return NextResponse.json(
      {
        message: "USER authentication service is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
