import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  return proxyAdminRequest(
    request,
    `/admin/notifications${request.nextUrl.search}`,
    { method: "GET" },
  );
}

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
