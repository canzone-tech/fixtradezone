import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site verification requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let token: string;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.token !== "string" || body.token.length > 256) {
      throw new Error("Invalid token");
    }
    token = body.token.trim();
  } catch {
    return NextResponse.json(
      { message: "Invalid email verification request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await backendFetch("/auth/email-verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        { message: getApiErrorMessage(payload, "Unable to verify email.") },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Email verification service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
