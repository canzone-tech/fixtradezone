import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/internal-trading/policies", {
    method: "GET",
  });
}

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/internal-trading/policies/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
