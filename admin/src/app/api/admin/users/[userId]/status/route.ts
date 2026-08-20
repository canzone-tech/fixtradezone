import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
