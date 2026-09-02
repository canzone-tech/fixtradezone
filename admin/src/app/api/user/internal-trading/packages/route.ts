import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  return proxyUserRequest(request, "/internal-trading/me/packages", {
    method: "GET",
  });
}
