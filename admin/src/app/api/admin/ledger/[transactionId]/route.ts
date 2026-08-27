import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ transactionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { transactionId } = await context.params;
  return proxyAdminRequest(request, `/admin/ledger/${transactionId}`, {
    method: "GET",
  });
}
