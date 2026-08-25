import type { Metadata } from "next";
import UserReferralsClient from "./user-referrals-client";

export const metadata: Metadata = {
  title: "My Referrals",
};

export default function UserReferralsPage() {
  return <UserReferralsClient />;
}
