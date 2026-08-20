import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      roleName: string;
    }>;
  },
) {
  const { roleName } =
    await params;

  return proxyAdminRequest(
    request,
    `/admin/rbac/roles/${encodeURIComponent(roleName)}/permissions`,
    {
      method: "PUT",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: await request.text(),
    },
  );
}
