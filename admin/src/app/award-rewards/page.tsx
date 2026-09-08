import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import AwardRewardsClient from "./award-rewards-client";

export const metadata: Metadata = {
  title: "Award & Reward | FixTradeZone",
};

export default async function AwardRewardsPage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) redirect("/login");

  return (
    <AdminShell>
      <AwardRewardsClient />
    </AdminShell>
  );
}
