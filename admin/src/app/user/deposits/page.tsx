import type { Metadata } from "next";
import UserDepositsSingleStepClient from "./user-deposits-single-step-client";

export const metadata: Metadata = {
  title: "Deposits | FixTradeZone",
};

export default function UserDepositsPage() {
  return <UserDepositsSingleStepClient />;
}
