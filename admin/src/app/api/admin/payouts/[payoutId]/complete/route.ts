import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ payoutId: string }> },
) {
  const { payoutId } = await context.params;

  return proxyAdminRequest(
    request,
    `/admin/payouts/${encodeURIComponent(payoutId)}/complete`,
    { method: "POST" },
  );
}
