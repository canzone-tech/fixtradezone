import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ railId: string }> },
) {
  const { railId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/deposit-payment-rails/${railId}/approval-mode`,
    { method: "GET" },
  );
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ railId: string }> },
) {
  const { railId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/deposit-payment-rails/${railId}/approval-mode`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
