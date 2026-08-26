import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(
    request,
    `/admin/wallets/reconciliation${request.nextUrl.search}`,
    { method: "GET" },
  );
}
