import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/settings/duplicate-account/allowlist/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
