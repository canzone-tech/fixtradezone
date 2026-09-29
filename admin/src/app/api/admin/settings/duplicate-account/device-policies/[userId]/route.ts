import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  const body = await request.text();

  return proxyAdminRequest(
    request,
    `/admin/settings/duplicate-account/device-policies/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { userId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/settings/duplicate-account/device-policies/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}
