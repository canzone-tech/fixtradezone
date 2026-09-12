import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyUserRequest(request, "/subscriptions/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
