import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import SecurityConfigurationClient from "./security-configuration-client";

export default async function SecurityConfigurationPage() {
  const cookieStore = await cookies();

  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <SecurityConfigurationClient />
    </AdminShell>
  );
}
