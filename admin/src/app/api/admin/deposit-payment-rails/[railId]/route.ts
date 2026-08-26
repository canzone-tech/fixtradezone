import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ railId: string }> },
) {
  const { railId } = await context.params;

  return proxyAdminRequest(request, `/admin/deposit-payment-rails/${railId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
