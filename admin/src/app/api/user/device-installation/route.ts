import { NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_TOKEN_COOKIE } from "@/lib/admin-impersonation";
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  isCrossSiteRequest,
} from "@/lib/auth";
import { backendFetch, readJson } from "@/lib/backend";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site device observations are not allowed." },
      { status: 403 },
    );
  }

  if (request.cookies.get(IMPERSONATION_TOKEN_COOKIE)?.value) {
    return NextResponse.json(
      { message: "Device observation is disabled during impersonation." },
      { status: 403 },
    );
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ message: "Session expired." }, { status: 401 });
  }

  try {
    const body = await request.text();
    const response = await backendFetch("/auth/device-installation", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    const payload = await readJson(response);
    const nextResponse = NextResponse.json(
      payload ?? {
        message: response.ok
          ? "Device installation observed."
          : "Unable to observe device installation.",
      },
      {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      },
    );

    if (response.status === 401) {
      clearAuthCookies(nextResponse);
    }

    return nextResponse;
  } catch {
    return NextResponse.json(
      { message: "Device observation service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
