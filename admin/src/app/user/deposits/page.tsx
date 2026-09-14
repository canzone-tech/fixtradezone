import type { Metadata } from "next";
import UserDepositsClient from "./user-deposits-client";

export const metadata: Metadata = {
  title: "Deposits | FixTradeZone",
};

export default function UserDepositsPage() {
  return <UserDepositsClient />;
}
