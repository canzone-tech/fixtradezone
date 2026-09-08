import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(request: NextRequest) {
  return proxyAdminRequest(
    request,
    "/admin/simulated-activity/policies/drafts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
