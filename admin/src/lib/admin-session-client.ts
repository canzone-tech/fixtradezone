import type { AdminUser } from "@/lib/auth";

interface SessionPayload {
  user?: AdminUser;
  message?: string;
}

export interface AdminSessionResult {
  status: number;
  user: AdminUser | null;
  message: string | null;
}

let sessionRequest: Promise<AdminSessionResult> | null = null;

async function requestSession(): Promise<AdminSessionResult> {
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as SessionPayload;

    return {
      status: response.status,
      user: response.ok && payload.user ? payload.user : null,
      message: payload.message ?? null,
    };
  } catch {
    return {
      status: 503,
      user: null,
      message: "Authentication service is temporarily unavailable.",
    };
  }
}

export function resolveAdminSession(): Promise<AdminSessionResult> {
  if (!sessionRequest) {
    const request = requestSession();
    sessionRequest = request;

    void request.finally(() => {
      if (sessionRequest === request) {
        sessionRequest = null;
      }
    });
  }

  return sessionRequest;
}

export function clearAdminSessionCache(): void {
  sessionRequest = null;
}
