import { NextRequest, NextResponse } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";
import {
  copyResponseCookies,
  isImpersonationStartPayload,
  setImpersonationCookies,
} from "@/lib/admin-impersonation";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      userId: string;
    }>;
  },
) {
  const { userId } = await params;

  const proxied = await proxyAdminRequest(
    request,
    `/admin/users/${encodeURIComponent(userId)}/impersonation`,
    {
      method: "POST",
    },
  );

  if (!proxied.ok) {
    return proxied;
  }

  let payload: unknown;

  try {
    payload = await proxied.clone().json();
  } catch {
    const response = NextResponse.json(
      {
        message: "Impersonation service returned an invalid response.",
      },
      { status: 502 },
    );

    copyResponseCookies(proxied, response);

    return response;
  }

  if (!isImpersonationStartPayload(payload)) {
    const response = NextResponse.json(
      {
        message: "Impersonation service returned an invalid response.",
      },
      { status: 502 },
    );

    copyResponseCookies(proxied, response);

    return response;
  }

  /*
   * Important:
   * impersonationToken is deliberately removed
   * from the browser-visible JSON response.
   * It is stored only in an HttpOnly cookie.
   */
  const response = NextResponse.json(
    {
      message: payload.message,
      expiresIn: payload.expiresIn,
      impersonation: payload.impersonation,
    },
    {
      status: proxied.status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  copyResponseCookies(proxied, response);
  setImpersonationCookies(response, payload);

  return response;
}
