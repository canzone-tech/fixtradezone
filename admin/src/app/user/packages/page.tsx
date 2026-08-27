import type { Metadata } from "next";
import UserPackagesClient from "./user-packages-client";

export const metadata: Metadata = {
  title: "Packages | FixTradeZone",
};

export default function UserPackagesPage() {
  return <UserPackagesClient />;
}
