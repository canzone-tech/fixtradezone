import { NextResponse } from "next/server";
import { backendFetch, readJson } from "@/lib/backend";

export async function GET() {
  try {
    const backendResponse = await backendFetch("/public/site-mode", {
      method: "GET",
    });
    const payload = await readJson(backendResponse);

    return NextResponse.json(
      payload ?? {
        message: backendResponse.ok
          ? "Platform status received."
          : "Unable to read platform status.",
      },
      {
        status: backendResponse.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { message: "Platform status is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
