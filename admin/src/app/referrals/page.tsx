import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import ReferralsClient from "./referrals-client";

export default async function ReferralsPage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <ReferralsClient />
    </AdminShell>
  );
}
