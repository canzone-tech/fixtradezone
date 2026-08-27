import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { planVersionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/package-plans/${encodeURIComponent(planVersionId)}`,
    { method: "GET" },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { planVersionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/package-plans/${encodeURIComponent(planVersionId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
