import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface CaptchaRequestBody {
  purpose?: unknown;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site authentication requests are not allowed." },
      { status: 403 },
    );
  }

  let body: CaptchaRequestBody;

  try {
    body = (await request.json()) as CaptchaRequestBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (body.purpose !== "LOGIN" && body.purpose !== "REGISTRATION") {
    return NextResponse.json(
      { message: "Invalid CAPTCHA purpose." },
      { status: 400 },
    );
  }

  try {
    const backendResponse = await backendFetch("/auth/captcha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        purpose: body.purpose,
      }),
    });

    const payload = await readJson(backendResponse);

    if (!backendResponse.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to create CAPTCHA challenge.",
          ),
        },
        { status: backendResponse.status },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "CAPTCHA service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
