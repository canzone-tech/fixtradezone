import { NextRequest, NextResponse } from "next/server";
import {
  isCrossSiteRequest,
  normalizeDeviceInstallationId,
  setDeviceInstallationCookie,
} from "@/lib/auth";

interface DeviceContextBody {
  deviceInstallationId?: unknown;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { message: "Cross-site device context requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: DeviceContextBody;
  try {
    body = (await request.json()) as DeviceContextBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const deviceInstallationId = normalizeDeviceInstallationId(
    body.deviceInstallationId,
  );
  if (!deviceInstallationId) {
    return NextResponse.json(
      { message: "Invalid device installation ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { message: "Device context stored." },
    { headers: { "Cache-Control": "no-store" } },
  );
  setDeviceInstallationCookie(response, deviceInstallationId);
  return response;
}
