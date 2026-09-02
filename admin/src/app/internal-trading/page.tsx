import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import InternalTradingAdminClient from "./internal-trading-admin-client";

export const metadata: Metadata = {
  title: "Internal Trading | FixTradeZone",
};

export default async function InternalTradingPage() {
  const cookieStore = await cookies();

  if (!cookieStore.has(ACCESS_COOKIE) && !cookieStore.has(REFRESH_COOKIE)) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <InternalTradingAdminClient />
    </AdminShell>
  );
}
