import type { Metadata } from "next";
import UserSimulatedActivityClient from "./user-simulated-activity-client";

export const metadata: Metadata = {
  title: "Simulated Trade Activity | FixTradeZone",
};

export default function UserSimulatedActivityPage() {
  return <UserSimulatedActivityClient />;
}
