import { NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface RegisterBody {
  email?: string;
  password?: string;
  username?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  referralCode?: string;
  captchaId?: string;
  captchaAnswer?: string;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error("Invalid registration request.");
  }

  return value;
}

function referralCodeFromRequest(
  request: NextRequest,
  source: Record<string, unknown>,
): string | undefined {
  const explicit = optionalString(source.referralCode, 64)?.trim();

  if (explicit) {
    return explicit;
  }

  const referer = request.headers.get("referer");

  if (!referer) {
    return undefined;
  }

  let refererUrl: URL;

  try {
    refererUrl = new URL(referer);
  } catch {
    return undefined;
  }

  if (refererUrl.origin !== request.nextUrl.origin) {
    return undefined;
  }

  const referralCode = refererUrl.searchParams.get("ref")?.trim();

  if (!referralCode) {
    return undefined;
  }

  if (referralCode.length > 64) {
    throw new Error("Invalid registration request.");
  }

  return referralCode;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      {
        message: "Cross-site registration requests are not allowed.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let body: RegisterBody;

  try {
    const source = (await request.json()) as Record<string, unknown>;

    body = {
      email: optionalString(source.email, 191),
      password: optionalString(source.password, 128),
      username: optionalString(source.username, 30),
      phone: optionalString(source.phone, 16),
      firstName: optionalString(source.firstName, 100),
      lastName: optionalString(source.lastName, 100),
      referralCode: referralCodeFromRequest(request, source),
      captchaId: optionalString(source.captchaId, 128),
      captchaAnswer: optionalString(source.captchaAnswer, 32),
    };
  } catch {
    return NextResponse.json(
      {
        message: "Invalid registration request.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const response = await backendFetch("/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(payload, "Unable to register account."),
        },
        {
          status: response.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("user" in payload) ||
      typeof payload.user !== "object" ||
      payload.user === null
    ) {
      return NextResponse.json(
        {
          message: "Registration service returned an invalid response.",
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const source = payload as Record<string, unknown>;
    const user = source.user as Record<string, unknown>;

    const browserPayload = {
      message:
        typeof source.message === "string"
          ? source.message
          : "Registration successful.",
      user: {
        id: typeof user.id === "string" ? user.id : "",
        email: typeof user.email === "string" ? user.email : null,
        username: typeof user.username === "string" ? user.username : "",
        phone: typeof user.phone === "string" ? user.phone : null,
        firstName: typeof user.firstName === "string" ? user.firstName : null,
        lastName: typeof user.lastName === "string" ? user.lastName : null,
        status: typeof user.status === "string" ? user.status : "PENDING",
      },
      ...(typeof source.temporaryPassword === "string"
        ? {
            temporaryPassword: source.temporaryPassword,
            mustChangePassword: source.mustChangePassword === true,
          }
        : {}),
    };

    return NextResponse.json(browserPayload, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        message: "Registration service is unavailable.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
