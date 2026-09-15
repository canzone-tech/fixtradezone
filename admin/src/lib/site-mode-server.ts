import { backendFetch, readJson } from "@/lib/backend";
import {
  isPublicSiteModeStatus,
  type PublicSiteModeStatus,
} from "@/lib/site-mode";

export async function getPublicSiteModeStatus(): Promise<PublicSiteModeStatus | null> {
  try {
    const response = await backendFetch("/public/site-mode", {
      method: "GET",
    });
    const payload = await readJson(response);

    if (response.ok && isPublicSiteModeStatus(payload)) {
      return payload;
    }
  } catch {
    // Public availability fails closed when the authoritative mode is unknown.
  }

  return null;
}
