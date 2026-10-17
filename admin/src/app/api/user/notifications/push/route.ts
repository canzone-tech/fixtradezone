import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function GET(request: NextRequest) {
  return proxyUserRequest(request, "/notifications/push/config", {
    method: "GET",
  });
}

export async function POST(request: NextRequest) {
  return proxyUserRequest(request, "/notifications/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}

export async function DELETE(request: NextRequest) {
  return proxyUserRequest(request, "/notifications/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
