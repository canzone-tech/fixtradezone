import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { userId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/settings/site-mode/testers/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}
