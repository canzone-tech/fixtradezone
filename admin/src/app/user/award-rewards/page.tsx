import type { Metadata } from "next";
import UserAwardRewardsClient from "./user-award-rewards-client";

export const metadata: Metadata = {
  title: "Award & Reward | FixTradeZone",
};

export default function UserAwardRewardsPage() {
  return <UserAwardRewardsClient />;
}
