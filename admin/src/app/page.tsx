import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in | FixTradeZone",
  description: "Sign in to your secure FixTradeZone workspace.",
};

export default function Home() {
  redirect("/login");
}
