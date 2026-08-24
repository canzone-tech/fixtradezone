import { NextRequest, NextResponse } from "next/server";
import {
  PASSWORD_CHANGE_COOKIE,
  clearPasswordChangeCookie,
  isCrossSiteRequest,
} from "@/lib/auth";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface ChangePasswordBody {
  newPassword?: unknown;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site authentication requests are not allowed." },
      { status: 403 },
    );
  }

  let body: ChangePasswordBody;

  try {
    body = (await request.json()) as ChangePasswordBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (
    typeof body.newPassword !== "string" ||
    body.newPassword.length < 12 ||
    body.newPassword.length > 128
  ) {
    return NextResponse.json(
      { message: "New password must contain between 12 and 128 characters." },
      { status: 400 },
    );
  }

  const passwordChangeToken = request.cookies.get(
    PASSWORD_CHANGE_COOKIE,
  )?.value;

  if (!passwordChangeToken) {
    return NextResponse.json(
      { message: "Password change session is missing or expired." },
      { status: 401 },
    );
  }

  try {
    const backendResponse = await backendFetch(
      "/auth/change-required-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          passwordChangeToken,
          newPassword: body.newPassword,
        }),
      },
    );

    const payload = await readJson(backendResponse);

    if (!backendResponse.ok) {
      const response = NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to change the required password.",
          ),
        },
        { status: backendResponse.status },
      );

      if (backendResponse.status === 401) {
        clearPasswordChangeCookie(response);
      }

      return response;
    }

    const response = NextResponse.json(
      {
        message: getApiErrorMessage(
          payload,
          "Password changed successfully. Please sign in again.",
        ),
      },
      { status: 200 },
    );

    clearPasswordChangeCookie(response);

    return response;
  } catch {
    return NextResponse.json(
      { message: "Authentication service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
