import { NextRequest, NextResponse } from "next/server";
import { proxyUserRequest } from "@/lib/user-backend";

interface DepositSubmitPayload {
  message?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  const response = await proxyUserRequest(request, "/deposits/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });

  if (!response.ok) return response;

  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as DepositSubmitPayload | null;

  if (!payload) return response;

  const nextResponse = NextResponse.json(
    {
      ...payload,
      message:
        "Deposit submitted successfully. Payment verification is being processed.",
    },
    {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    },
  );

  for (const cookie of response.cookies.getAll()) {
    nextResponse.cookies.set(cookie);
  }

  return nextResponse;
}
