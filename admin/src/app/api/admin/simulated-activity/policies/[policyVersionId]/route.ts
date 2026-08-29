import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ policyVersionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { policyVersionId } = await params;
  return proxyAdminRequest(
    request,
    `/admin/simulated-activity/policies/${encodeURIComponent(policyVersionId)}`,
    { method: "GET" },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { policyVersionId } = await params;
  return proxyAdminRequest(
    request,
    `/admin/simulated-activity/policies/${encodeURIComponent(policyVersionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
