import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import RewardsClient from "./rewards-client";

export const metadata: Metadata = {
  title: "Package Rewards | FixTradeZone",
};

export default async function RewardsPage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) redirect("/login");

  return (
    <AdminShell>
      <RewardsClient />
    </AdminShell>
  );
}
