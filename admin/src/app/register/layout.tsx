import PublicSiteModeScreen from "@/components/platform/public-site-mode-screen";
import { getPublicSiteModeStatus } from "@/lib/site-mode-server";

export default async function RegistrationAvailabilityLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const status = await getPublicSiteModeStatus();

  if (!status || status.siteMode !== "LIVE") {
    return <PublicSiteModeScreen status={status} />;
  }

  return children;
}
