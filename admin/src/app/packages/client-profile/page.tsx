import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import ClientPackageProfileClient from "./client-package-profile-client";

export const metadata: Metadata = {
  title: "Client Package Profile | FixTradeZone",
};

export default async function ClientPackageProfilePage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <ClientPackageProfileClient />
    </AdminShell>
  );
}
