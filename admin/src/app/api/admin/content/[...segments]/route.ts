import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-backend";

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

function contentPath(segments: string[]): string | null {
  if (
    segments.length === 0 ||
    segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return null;
  }

  return `/admin/content/${segments.map(encodeURIComponent).join("/")}`;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { segments } = await params;
  const path = contentPath(segments);

  if (!path) {
    return Response.json({ message: "Invalid content route." }, { status: 400 });
  }

  return proxyAdminRequest(request, `${path}${request.nextUrl.search}`, {
    method: "GET",
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { segments } = await params;
  const path = contentPath(segments);

  if (!path) {
    return Response.json({ message: "Invalid content route." }, { status: 400 });
  }

  return proxyAdminRequest(request, path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });
}
