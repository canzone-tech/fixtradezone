import type { Metadata, Viewport } from "next";
import PlatformTimeProvider from "@/components/platform/platform-time-provider";
import AppPwa from "@/components/pwa/app-pwa";
import "./globals.css";
import "iconoir/css/iconoir.css";
import "../styles/fixtradezone-theme.scss";

export const metadata: Metadata = {
  applicationName: "FixTradeZone",
  title: {
    default: "FixTradeZone",
    template: "%s | FixTradeZone",
  },
  description: "Secure FixTradeZone application for administrators and users.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
    apple: "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#071a35",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      data-startbar="dark"
      data-bs-theme="dark"
      suppressHydrationWarning
    >
      <body id="body">
        <AppPwa />
        <PlatformTimeProvider>{children}</PlatformTimeProvider>
      </body>
    </html>
  );
}
