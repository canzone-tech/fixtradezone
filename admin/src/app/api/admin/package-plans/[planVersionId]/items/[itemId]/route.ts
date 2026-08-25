import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ planVersionId: string; itemId: string }>;
  },
) {
  const { planVersionId, itemId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/package-plans/${encodeURIComponent(
      planVersionId,
    )}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
