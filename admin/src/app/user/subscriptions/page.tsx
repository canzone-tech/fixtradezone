import type { Metadata } from "next";
import UserSubscriptionsClient from "./user-subscriptions-client";

export const metadata: Metadata = {
  title: "Subscriptions | FixTradeZone",
};

export default function UserSubscriptionsPage() {
  return <UserSubscriptionsClient />;
}
