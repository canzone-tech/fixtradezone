import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(
    request,
    `/admin/payout-policies${request.nextUrl.search}`,
    { method: "GET" },
  );
}

export function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/payout-policies/drafts", {
    method: "POST",
  });
}
