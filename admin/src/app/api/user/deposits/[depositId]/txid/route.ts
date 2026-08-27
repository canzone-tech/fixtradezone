import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ depositId: string }> },
) {
  const { depositId } = await context.params;

  return proxyUserRequest(
    request,
    `/deposits/${encodeURIComponent(depositId)}/txid`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
