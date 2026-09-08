import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  return proxyUserRequest(request, `/payouts/me${request.nextUrl.search}`, {
    method: "GET",
  });
}

export async function POST(request: NextRequest) {
  return proxyUserRequest(request, "/payouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
