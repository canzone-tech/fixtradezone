import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/internal-trading/subscriptions/${encodeURIComponent(subscriptionId)}/reconcile-state`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
