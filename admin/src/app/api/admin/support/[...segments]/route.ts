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
  const contentType = request.headers.get("content-type") ?? "";

  if (method !== "GET" && contentType.toLowerCase().includes("multipart/form-data")) {
    const body = await request.formData();

    return proxyAdminRequest(
      request,
      `/admin/support/${path}${request.nextUrl.search}`,
      {
        method,
        body,
        signal: AbortSignal.timeout(30_000),
      },
    );
  }

  const body = method === "GET" ? undefined : await request.arrayBuffer();

  return proxyAdminRequest(
    request,
    `/admin/support/${path}${request.nextUrl.search}`,
    {
      method,
      ...(body && body.byteLength > 0
        ? {
            ...(contentType ? { headers: { "Content-Type": contentType } } : {}),
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
