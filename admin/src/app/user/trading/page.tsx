import type { Metadata } from "next";
import UserTradingClient from "./user-trading-client";

export const metadata: Metadata = {
  title: "Trading | FixTradeZone",
};

export default function UserTradingPage() {
  return <UserTradingClient />;
}
