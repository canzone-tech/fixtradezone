import { NextRequest, NextResponse } from "next/server";
import {
  type AuthResponse,
  clearAuthCookies,
  getPortalRedirect,
  isAuthResponse,
  isCrossSiteRequest,
  isPasswordChangeRequiredResponse,
  normalizeDeviceInstallationId,
  setAuthCookies,
  setDeviceInstallationCookie,
  setPasswordChangeCookie,
} from "@/lib/auth";
import {
  backendFetch,
  forwardedBackendHeaders,
  getApiErrorMessage,
  readJson,
} from "@/lib/backend";

interface LoginBody {
  identifier?: unknown;
  password?: unknown;
  deviceInstallationId?: unknown;
  captchaId?: unknown;
  captchaAnswer?: unknown;
}

function readPendingVerificationError(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("code" in payload) ||
    payload.code !== "EMAIL_VERIFICATION_PENDING"
  ) {
    return null;
  }

  const expiresIn =
    "verificationLinkExpiresIn" in payload &&
    typeof payload.verificationLinkExpiresIn === "number" &&
    Number.isFinite(payload.verificationLinkExpiresIn)
      ? Math.max(0, Math.floor(payload.verificationLinkExpiresIn))
      : 0;
  const ttlSeconds =
    "verificationLinkTtlSeconds" in payload &&
    typeof payload.verificationLinkTtlSeconds === "number" &&
    Number.isFinite(payload.verificationLinkTtlSeconds)
      ? Math.max(1, Math.floor(payload.verificationLinkTtlSeconds))
      : 30 * 60;

  return {
    message: getApiErrorMessage(payload, "Email verification pending."),
    code: "EMAIL_VERIFICATION_PENDING" as const,
    canResend:
      "canResend" in payload && typeof payload.canResend === "boolean"
        ? payload.canResend
        : expiresIn <= 0,
    verificationLinkExpiresIn: expiresIn,
    verificationLinkTtlSeconds: ttlSeconds,
  };
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site authentication requests are not allowed." },
      { status: 403 },
    );
  }

  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (
    typeof body.identifier !== "string" ||
    body.identifier.trim().length === 0 ||
    typeof body.password !== "string" ||
    body.password.length === 0
  ) {
    return NextResponse.json(
      { message: "Identifier and password are required." },
      { status: 400 },
    );
  }

  const deviceInstallationId =
    body.deviceInstallationId === undefined
      ? null
      : normalizeDeviceInstallationId(body.deviceInstallationId);

  if (body.deviceInstallationId !== undefined && !deviceInstallationId) {
    return NextResponse.json(
      { message: "Invalid device installation ID." },
      { status: 400 },
    );
  }

  if (body.captchaId !== undefined && typeof body.captchaId !== "string") {
    return NextResponse.json(
      { message: "Invalid CAPTCHA challenge." },
      { status: 400 },
    );
  }

  if (
    body.captchaAnswer !== undefined &&
    typeof body.captchaAnswer !== "string"
  ) {
    return NextResponse.json(
      { message: "Invalid CAPTCHA answer." },
      { status: 400 },
    );
  }

  try {
    const backendResponse = await backendFetch("/auth/login", {
      method: "POST",
      headers: forwardedBackendHeaders(request, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        identifier: body.identifier,
        password: body.password,
        ...(deviceInstallationId ? { deviceInstallationId } : {}),
        ...(body.captchaId !== undefined ? { captchaId: body.captchaId } : {}),
        ...(body.captchaAnswer !== undefined
          ? { captchaAnswer: body.captchaAnswer }
          : {}),
      }),
    });

    const payload = await readJson(backendResponse);

    if (!backendResponse.ok) {
      const pendingVerification = readPendingVerificationError(payload);

      return NextResponse.json(
        pendingVerification ?? {
          message: getApiErrorMessage(payload, "Unable to sign in."),
        },
        { status: backendResponse.status },
      );
    }

    if (isPasswordChangeRequiredResponse(payload)) {
      const response = NextResponse.json({
        message: payload.message,
        passwordChangeRequired: true,
        expiresIn: payload.expiresIn,
        user: payload.user,
      });

      clearAuthCookies(response);
      if (deviceInstallationId) {
        setDeviceInstallationCookie(response, deviceInstallationId);
      }
      setPasswordChangeCookie(response, payload);
      return response;
    }

    if (!isAuthResponse(payload)) {
      return NextResponse.json(
        { message: "Authentication service returned an invalid response." },
        { status: 502 },
      );
    }

    const auth: AuthResponse = payload;
    const redirectTo = getPortalRedirect(auth.user);

    if (!redirectTo) {
      await backendFetch("/auth/logout", {
        method: "POST",
        headers: forwardedBackendHeaders(request, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }).catch(() => undefined);

      return NextResponse.json(
        { message: "This account does not have access to a FixTradeZone portal." },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ user: auth.user, redirectTo });
    setAuthCookies(response, auth);
    if (deviceInstallationId) {
      setDeviceInstallationCookie(response, deviceInstallationId);
    }
    return response;
  } catch {
    return NextResponse.json(
      { message: "Authentication service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
