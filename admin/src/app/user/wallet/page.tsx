import type { Metadata } from "next";
import UserWalletClient from "./user-wallet-client";

export const metadata: Metadata = {
  title: "Wallet | FixTradeZone",
};

export default function UserWalletPage() {
  return <UserWalletClient />;
}
