import { NextRequest, NextResponse } from "next/server";
import {
  type AuthResponse,
  isAuthResponse,
  isAdministrator,
  isCrossSiteRequest,
  setAuthCookies,
} from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface LoginBody {
  email?: unknown;
  password?: unknown;
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

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { message: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    const backendResponse = await backendFetch("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });
    const payload = await readJson(backendResponse);

    if (!backendResponse.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(payload, "Unable to sign in."),
        },
        { status: backendResponse.status },
      );
    }

    if (!isAuthResponse(payload)) {
      return NextResponse.json(
        { message: "Authentication service returned an invalid response." },
        { status: 502 },
      );
    }

    const auth: AuthResponse = payload;

    if (!auth.user || !isAdministrator(auth.user)) {
      await backendFetch("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }).catch(() => undefined);

      return NextResponse.json(
        { message: "Administrator access is required." },
        { status: 403 },
      );
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
