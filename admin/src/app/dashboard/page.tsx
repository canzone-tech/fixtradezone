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
          className="ftz-dashboard"
          style={{ minHeight: 0, background: "transparent" }}
        >
          <div className="ftz-dashboard-layout">
            <section style={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <DashboardMarketPanel />
            </section>
          </div>
        </div>
      </>
    </AdminShell>
  );
}
