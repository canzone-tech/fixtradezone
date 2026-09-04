import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(
    request,
    `/admin/reports/overview${request.nextUrl.search}`,
    { method: "GET" },
  );
}
