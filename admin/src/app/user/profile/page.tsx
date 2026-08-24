import type { Metadata } from "next";
import UserProfileClient from "./profile-client";

export const metadata: Metadata = {
  title: "My Profile | FixTradeZone",
};

export default function UserProfilePage() {
  return <UserProfileClient />;
}
