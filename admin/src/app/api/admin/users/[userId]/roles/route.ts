import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  return proxyAdminRequest(
    request,
    `/admin/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
  );
}
