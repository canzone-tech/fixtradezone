import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function firstValidClientIp(request: NextRequest): string | null {
  const candidates = [
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && isIP(value) !== 0) {
      return value;
    }
  }

  return null;
}

export function forwardedBackendHeaders(
  request: NextRequest,
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init);
  const clientIp = firstValidClientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 1000);

  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
  }

  if (userAgent) {
    headers.set("User-Agent", userAgent);
  }

  return headers;
}

export function backendFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers,
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("message" in payload)
  ) {
    return fallback;
  }

  const message = payload.message;

  if (typeof message === "string") {
    return message;
  }

  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string")
  ) {
    return message[0] ?? fallback;
  }

  return fallback;
}
