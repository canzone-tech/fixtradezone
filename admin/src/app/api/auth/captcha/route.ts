import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import {
  backendFetch,
  forwardedBackendHeaders,
  getApiErrorMessage,
  readJson,
} from "@/lib/backend";

interface CaptchaRequestBody {
  purpose?: unknown;
}

const CAPTCHA_BACKEND_ATTEMPTS = 3;
const CAPTCHA_BACKEND_TIMEOUT_MS = 2_500;
const CAPTCHA_BACKEND_RETRY_DELAY_MS = 200;

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchCaptchaChallenge(
  purpose: "LOGIN" | "REGISTRATION",
  headers: HeadersInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CAPTCHA_BACKEND_ATTEMPTS; attempt += 1) {
    try {
      return await backendFetch("/auth/captcha", {
        method: "POST",
        headers,
        body: JSON.stringify({ purpose }),
        signal: AbortSignal.timeout(CAPTCHA_BACKEND_TIMEOUT_MS),
      });
    } catch (caught: unknown) {
      lastError = caught;

      if (attempt < CAPTCHA_BACKEND_ATTEMPTS) {
        await wait(CAPTCHA_BACKEND_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("CAPTCHA backend request failed.");
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
    const backendResponse = await fetchCaptchaChallenge(
      body.purpose,
      forwardedBackendHeaders(request, {
        "Content-Type": "application/json",
      }),
    );
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
