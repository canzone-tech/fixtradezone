"use client";

import LiveMarketOverview from "@/components/ui/live-market-overview";

export default function DashboardMarketPanel() {
  return (
    <LiveMarketOverview
      overviewUrl="/api/admin/dashboard/market"
      historyUrl="/api/admin/dashboard/market/history"
    />
  );
}
