import type { Metadata } from "next";
import HowItWorksClient from "./how-it-works-client";

export const metadata: Metadata = {
  title: "How FixTradeZone Works | FixTradeZone",
};

export default function HowItWorksPage() {
  return <HowItWorksClient />;
}
