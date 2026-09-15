import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function POST(request: NextRequest) {
  return proxyUserRequest(request, "/payouts/reinvest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
