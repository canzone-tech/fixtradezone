import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ policyVersionId: string }> },
) {
  const { policyVersionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/payout-policies/${encodeURIComponent(policyVersionId)}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
