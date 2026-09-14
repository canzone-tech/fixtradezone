import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

async function proxy(
  request: NextRequest,
  context: RouteContext,
  method: "GET" | "POST" | "PATCH",
) {
  const { segments } = await context.params;
  const path = segments.map(encodeURIComponent).join("/");
  const body = method === "GET" ? undefined : await request.text();

  return proxyAdminRequest(
    request,
    `/admin/support/${path}${request.nextUrl.search}`,
    {
      method,
      ...(body
        ? {
            headers: {
              "Content-Type":
                request.headers.get("content-type") ?? "application/json",
            },
            body,
          }
        : {}),
    },
  );
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "GET");
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "POST");
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "PATCH");
}
