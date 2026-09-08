import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ policyVersionId: string }> },
) {
  const { policyVersionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/internal-trading/policies/${encodeURIComponent(policyVersionId)}`,
    { method: "GET" },
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ policyVersionId: string }> },
) {
  const { policyVersionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/internal-trading/policies/${encodeURIComponent(policyVersionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
