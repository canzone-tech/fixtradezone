import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  return proxyUserRequest(request, `/deposits/payment-rails${search}`, {
    method: "GET",
  });
}
