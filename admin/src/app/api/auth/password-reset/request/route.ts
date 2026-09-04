import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site password reset requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let email: string;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.email !== "string" || body.email.length > 191) {
      throw new Error("Invalid email");
    }
    email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json(
      { message: "Invalid password reset request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await backendFetch("/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to request password reset.",
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
      { message: "Password recovery service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
