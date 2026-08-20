import type { Metadata } from "next";
import "./globals.css";
import "iconoir/css/iconoir.css";
import "../styles/fixtradezone-theme.scss";

export const metadata: Metadata = {
  title: {
    default: "FixTradeZone Admin",
    template: "%s | FixTradeZone Admin",
  },
  description:
    "Secure operations dashboard for FixTradeZone administrators.",
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
      <body id="body">{children}</body>
    </html>
  );
}
