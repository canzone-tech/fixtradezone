import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/internal-trading/subscriptions/${encodeURIComponent(subscriptionId)}/events${request.nextUrl.search}`,
    { method: "GET" },
  );
}
