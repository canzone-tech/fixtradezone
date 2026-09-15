import type { Metadata } from "next";
import UserPayoutsClient from "./user-payouts-client";

export const metadata: Metadata = {
  title: "Withdrawal | FixTradeZone",
};

export default function UserPayoutsPage() {
  return <UserPayoutsClient />;
}
