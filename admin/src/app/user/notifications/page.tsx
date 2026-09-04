import type { Metadata } from "next";
import UserNotificationsClient from "./user-notifications-client";

export const metadata: Metadata = {
  title: "Notifications | FixTradeZone",
};

export default function UserNotificationsPage() {
  return <UserNotificationsClient />;
}
