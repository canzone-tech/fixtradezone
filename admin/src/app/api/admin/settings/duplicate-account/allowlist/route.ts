import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(request: NextRequest) {
  const body = await request.text();

  return proxyAdminRequest(request, "/admin/settings/duplicate-account/allowlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
