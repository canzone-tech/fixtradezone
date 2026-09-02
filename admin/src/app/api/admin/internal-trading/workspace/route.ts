import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(
    request,
    `/admin/internal-trading/workspace${request.nextUrl.search}`,
    { method: "GET" },
  );
}
