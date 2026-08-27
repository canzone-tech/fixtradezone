import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "FixTradeZone User Portal",
    template: "%s | FixTradeZone",
  },
  description: "Secure FixTradeZone user portal.",
};

export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
