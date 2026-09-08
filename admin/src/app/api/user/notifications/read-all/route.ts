import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function POST(request: NextRequest) {
  return proxyUserRequest(request, "/notifications/read-all", {
    method: "POST",
  });
}
