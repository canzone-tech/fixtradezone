import { NextResponse } from "next/server";
import { backendFetch, getApiErrorMessage, readJson } from "@/lib/backend";

interface RegistrationPolicy {
  publicRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";
  usernameMode: "AUTO" | "MANUAL" | "AUTO_OR_MANUAL";
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
}

function isRegistrationPolicy(payload: unknown): payload is RegistrationPolicy {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const policy = payload as Record<string, unknown>;

  return (
    typeof policy.publicRegistrationEnabled === "boolean" &&
    typeof policy.emailRequired === "boolean" &&
    typeof policy.mobileRequired === "boolean" &&
    ["AUTO", "MANUAL", "AUTO_OR_MANUAL"].includes(
      String(policy.passwordMode),
    ) &&
    ["AUTO", "MANUAL", "AUTO_OR_MANUAL"].includes(
      String(policy.usernameMode),
    ) &&
    typeof policy.usernamePrefixEnabled === "boolean" &&
    (policy.usernamePrefix === null ||
      typeof policy.usernamePrefix === "string")
  );
}

export async function GET() {
  try {
    const response = await backendFetch("/auth/registration-policy", {
      method: "GET",
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getApiErrorMessage(
            payload,
            "Unable to load registration policy.",
          ),
        },
        {
          status: response.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (!isRegistrationPolicy(payload)) {
      return NextResponse.json(
        {
          message: "Registration policy service returned an invalid response.",
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        message: "Registration policy service is unavailable.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
