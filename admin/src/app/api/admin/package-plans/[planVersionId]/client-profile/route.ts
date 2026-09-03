import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { planVersionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/package-plans/${encodeURIComponent(planVersionId)}/client-profile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
