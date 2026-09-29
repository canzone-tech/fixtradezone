import LoginSessionGate from "@/components/auth/login-session-gate";
import SiteModeBanner from "@/components/platform/site-mode-banner";

export default function LoginAvailabilityLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteModeBanner />
      <LoginSessionGate>{children}</LoginSessionGate>
    </>
  );
}
