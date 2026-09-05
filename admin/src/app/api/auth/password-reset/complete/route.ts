import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import {
  backendFetch,
  forwardedBackendHeaders,
  getApiErrorMessage,
  readJson,
} from "@/lib/backend";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site password reset requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let token: string;
  let newPassword: string;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.token !== "string" ||
      body.token.length > 256 ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 12 ||
      body.newPassword.length > 128
    ) {
      throw new Error("Invalid password reset request");
    }
    token = body.token.trim();
    newPassword = body.newPassword;
  } catch {
    return NextResponse.json(
      { message: "Invalid password reset request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await backendFetch("/auth/password-reset/complete", {
      method: "POST",
      headers: forwardedBackendHeaders(request, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ token, newPassword }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        { message: getApiErrorMessage(payload, "Unable to reset password.") },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Password recovery service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
