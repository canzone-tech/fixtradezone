import { NextRequest } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

export function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> },
) {
  return context.params.then(({ claimId }) =>
    proxyUserRequest(
      request,
      `/internal-trading/me/claims/${encodeURIComponent(claimId)}/claim`,
      { method: "POST" },
    ),
  );
}
