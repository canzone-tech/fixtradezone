import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ subscriptionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { subscriptionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/subscriptions/${encodeURIComponent(subscriptionId)}/process-commissions`,
    { method: "POST" },
  );
}
