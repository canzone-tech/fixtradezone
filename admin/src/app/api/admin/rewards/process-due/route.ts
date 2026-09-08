import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/rewards/process-due", {
    method: "POST",
  });
}
