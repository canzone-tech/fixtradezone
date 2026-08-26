import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

interface RouteContext {
  params: Promise<{ depositId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { depositId } = await context.params;
  return proxyAdminRequest(
    request,
    `/admin/deposits/${depositId}/post-accounting`,
    { method: "POST" },
  );
}
