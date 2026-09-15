import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ packageDefinitionId: string }> },
) {
  const { packageDefinitionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/deposit-package-accounts/${encodeURIComponent(packageDefinitionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
