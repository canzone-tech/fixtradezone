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
      { message: "Cross-site verification requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let email: string;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.email !== "string" || body.email.length > 191) {
      throw new Error("Invalid email");
    }
    email = body.email.trim();
  } catch {
    return NextResponse.json(
      { message: "Invalid resend request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await backendFetch("/auth/email-verification/resend", {
      method: "POST",
      headers: forwardedBackendHeaders(request, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ email }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to resend verification email.",
          ),
        },
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
