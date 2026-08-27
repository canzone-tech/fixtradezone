import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  const query = request.nextUrl.search;
  return proxyUserRequest(request, `/wallet/me${query}`, { method: "GET" });
}
