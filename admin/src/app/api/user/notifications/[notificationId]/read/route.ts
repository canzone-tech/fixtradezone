import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  const { notificationId } = await context.params;

  return proxyUserRequest(
    request,
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH" },
  );
}
