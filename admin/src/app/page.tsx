import PublicSiteModeScreen from "@/components/platform/public-site-mode-screen";
import { getPublicSiteModeStatus } from "@/lib/site-mode-server";
import LiveHome, { generateMetadata as generateLiveMetadata } from "./live-home";

export async function generateMetadata() {
  const status = await getPublicSiteModeStatus();

  if (!status) {
    return {
      title: "Service unavailable | FixTradeZone",
      description: "FixTradeZone public access is temporarily unavailable.",
    };
  }

  if (status.siteMode === "TESTING") {
    return {
      title: "Coming Soon | FixTradeZone",
      description: "FixTradeZone is currently in controlled pre-launch testing.",
    };
  }

  if (status.siteMode === "MAINTENANCE") {
    return {
      title: "Maintenance | FixTradeZone",
      description: "FixTradeZone is temporarily unavailable for maintenance.",
    };
  }

  return generateLiveMetadata();
}

export default async function Home() {
  const status = await getPublicSiteModeStatus();

  if (!status || status.siteMode !== "LIVE") {
    return <PublicSiteModeScreen status={status} />;
  }

  return <LiveHome />;
}
