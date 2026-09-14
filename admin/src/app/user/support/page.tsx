import type { Metadata } from "next";
import UserSupportClient from "./user-support-client";

export const metadata: Metadata = {
  title: "Support | FixTradeZone",
};

export default function UserSupportPage() {
  return <UserSupportClient />;
}
