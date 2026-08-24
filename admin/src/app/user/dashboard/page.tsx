import type { Metadata } from "next";
import UserDashboardClient from "./user-dashboard-client";

export const metadata: Metadata = {
  title: "User Dashboard | FixTradeZone",
};

export default function UserDashboardPage() {
  return <UserDashboardClient />;
}
