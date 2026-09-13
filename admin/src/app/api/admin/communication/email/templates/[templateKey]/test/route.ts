import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ templateKey: string }> },
) {
  const { templateKey } = await context.params;
  return proxyAdminRequest(
    request,
    `/admin/communication/email/templates/${encodeURIComponent(templateKey)}/test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    },
  );
}
