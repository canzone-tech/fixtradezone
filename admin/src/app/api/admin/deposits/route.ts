import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/admin/deposits?${query}` : "/admin/deposits";

  return proxyAdminRequest(request, path, { method: "GET" });
}
