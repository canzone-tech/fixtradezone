import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planVersionId: string }> },
) {
  const { planVersionId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/package-plans/${encodeURIComponent(planVersionId)}/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
