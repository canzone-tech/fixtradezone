import type { Metadata } from "next";
import UserRewardsClient from "./user-rewards-client";

export const metadata: Metadata = {
  title: "Rewards & Caps | FixTradeZone",
};

export default function UserRewardsPage() {
  return <UserRewardsClient />;
}
