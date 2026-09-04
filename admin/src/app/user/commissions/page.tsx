import type { Metadata } from "next";
import UserCommissionsClient from "./user-commissions-client";

export const metadata: Metadata = {
  title: "Referral Commissions | FixTradeZone",
};

export default function UserCommissionsPage() {
  return <UserCommissionsClient />;
}
