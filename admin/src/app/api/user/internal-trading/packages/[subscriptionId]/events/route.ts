import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;

  return proxyUserRequest(
    request,
    `/internal-trading/me/packages/${encodeURIComponent(subscriptionId)}/events${request.nextUrl.search}`,
    { method: "GET" },
  );
}
