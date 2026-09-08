import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ payoutId: string }> },
) {
  const params = await context.params;
  const backendPath = `/admin/payouts/${encodeURIComponent(params.payoutId)}/reject`;

  return proxyAdminRequest(request, backendPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
