import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/referrals/config", {
    method: "GET",
  });
}

export async function PATCH(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/referrals/config", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });
}
