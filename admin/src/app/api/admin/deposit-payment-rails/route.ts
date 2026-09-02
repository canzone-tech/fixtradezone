import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  return proxyAdminRequest(request, `/admin/deposit-payment-rails${search}`, {
    method: "GET",
  });
}

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/admin/deposit-payment-rails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
