import { NextRequest } from "next/server";
import { proxyAuthenticatedRequest } from "@/lib/authenticated-backend";

export async function POST(request: NextRequest) {
  const body = await request.text();

  return proxyAuthenticatedRequest(request, "/auth/reauthenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}
