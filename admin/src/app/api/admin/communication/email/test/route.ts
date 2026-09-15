import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

const EMAIL_DELIVERY_PROXY_TIMEOUT_MS = 45_000;

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/communication/email/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    signal: AbortSignal.timeout(EMAIL_DELIVERY_PROXY_TIMEOUT_MS),
  });
}
