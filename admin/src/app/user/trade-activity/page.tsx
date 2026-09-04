import type { Metadata } from "next";
import UserSimulatedActivityClient from "../simulated-activity/user-simulated-activity-client";

export const metadata: Metadata = {
  title: "Daily Trades | FixTradeZone",
};

export default function UserTradeActivityPage() {
  return <UserSimulatedActivityClient />;
}
