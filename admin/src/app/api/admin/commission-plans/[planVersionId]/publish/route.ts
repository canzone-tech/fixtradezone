import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { planVersionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/commission-plans/${encodeURIComponent(planVersionId)}/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
