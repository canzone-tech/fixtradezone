import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IMPERSONATION_TOKEN_COOKIE } from "@/lib/admin-impersonation";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import ImpersonationClient from "./impersonation-client";

export default async function UserImpersonationPage() {
  const cookieStore = await cookies();

  const hasAdminSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasAdminSession) {
    redirect("/login");
  }

  if (!cookieStore.has(IMPERSONATION_TOKEN_COOKIE)) {
    redirect("/users");
  }

  return <ImpersonationClient />;
}
