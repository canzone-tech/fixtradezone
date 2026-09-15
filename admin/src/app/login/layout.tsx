import SiteModeBanner from "@/components/platform/site-mode-banner";

export default function LoginAvailabilityLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteModeBanner />
      {children}
    </>
  );
}
