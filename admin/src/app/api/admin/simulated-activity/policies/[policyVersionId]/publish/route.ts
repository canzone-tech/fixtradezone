import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ policyVersionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { policyVersionId } = await params;
  return proxyAdminRequest(
    request,
    `/admin/simulated-activity/policies/${encodeURIComponent(policyVersionId)}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
