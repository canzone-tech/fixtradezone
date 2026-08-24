import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/settings/authentication", {
    method: "GET",
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.text();

  return proxyAdminRequest(request, "/admin/settings/authentication", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}
