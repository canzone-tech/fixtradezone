import type { Metadata, Viewport } from "next";
import UserPwaRegister from "@/components/user/user-pwa-register";

export const metadata: Metadata = {
  applicationName: "FixTradeZone User Portal",
  title: {
    default: "FixTradeZone User Portal",
    template: "%s | FixTradeZone",
  },
  description: "Secure FixTradeZone user portal.",
  manifest: "/user-manifest.webmanifest",
  icons: {
    icon: "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#071a35",
  colorScheme: "dark",
};

export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <UserPwaRegister />
      {children}
    </>
  );
}
