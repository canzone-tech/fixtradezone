import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packagePlanItemId: string }> },
) {
  const { packagePlanItemId } = await context.params;

  return proxyUserRequest(
    request,
    `/deposits/context/${encodeURIComponent(packagePlanItemId)}`,
    { method: "GET" },
  );
}
