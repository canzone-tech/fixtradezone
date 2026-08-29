import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  return proxyUserRequest(
    request,
    `/simulated-activity/me${request.nextUrl.search}`,
    { method: "GET" },
  );
}
