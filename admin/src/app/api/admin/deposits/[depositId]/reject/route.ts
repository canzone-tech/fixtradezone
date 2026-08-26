import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ depositId: string }> },
) {
  const { depositId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/deposits/${encodeURIComponent(depositId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
