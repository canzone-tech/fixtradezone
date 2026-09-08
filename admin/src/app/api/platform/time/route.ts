import { NextRequest } from "next/server";
import { proxyAuthenticatedRequest } from "@/lib/authenticated-backend";

export function GET(request: NextRequest) {
  return proxyAuthenticatedRequest(request, "/platform/time", {
    method: "GET",
  });
}
