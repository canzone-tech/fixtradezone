import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import DashboardClient from "./dashboard-client";
import DashboardMarketPanel from "./dashboard-market-panel";

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <>
        <DashboardClient />
        <div
          style={{
            padding: "0 clamp(22px, 4vw, 48px) 52px",
          }}
        >
          <DashboardMarketPanel />
        </div>
      </>
    </AdminShell>
  );
}
