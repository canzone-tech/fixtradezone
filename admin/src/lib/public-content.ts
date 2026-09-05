import { backendFetch, readJson } from "@/lib/backend";

export interface LandingFeatureContent {
  title: string;
  description: string;
}

export interface LandingContent {
  brandName: string;
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  features: LandingFeatureContent[];
  trustTitle: string;
  trustDescription: string;
  disclosure: string;
  footerText: string;
  seoTitle: string;
  seoDescription: string;
}

interface PublicLandingPayload {
  templateKey: string;
  content: LandingContent;
  source: "PUBLISHED_REVISION" | "DEFAULT";
}

export const FALLBACK_LANDING_CONTENT: LandingContent = {
  brandName: "FixTradeZone",
  badge: "SECURE DIGITAL ASSET PLATFORM",
  heroTitle: "Operate your account with",
  heroAccent: "clarity and control.",
  heroDescription:
    "A secure workspace for packages, deposits, referral activity, rewards, payouts and clearly labelled simulated activity.",
  primaryCtaLabel: "Sign in",
  primaryCtaHref: "/login",
  secondaryCtaLabel: "Create account",
  secondaryCtaHref: "/register",
  features: [
    {
      title: "Account operations",
      description:
        "Manage package, deposit, wallet and payout workflows from one protected account.",
    },
    {
      title: "Referral visibility",
      description:
        "Review direct referrals, genealogy and eligible package-based commission activity.",
    },
    {
      title: "Transparent activity",
      description:
        "Simulated results are clearly disclosed and remain separate from real wallet and ledger accounting.",
    },
  ],
  trustTitle: "Security-first account boundary",
  trustDescription:
    "Protected authentication, role-based access controls, session security and immutable accounting records support platform operations.",
  disclosure:
    "SIMULATED RESULTS ARE NOT REAL TRADING. Displayed simulated activity does not represent exchange execution or guaranteed, realized or withdrawable trading profit.",
  footerText: "FixTradeZone — secure platform operations.",
  seoTitle: "FixTradeZone | Secure Platform Operations",
  seoDescription:
    "Secure FixTradeZone access for packages, deposits, referrals, rewards, payouts and clearly disclosed simulated activity.",
};

function isLandingContent(value: unknown): value is LandingContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LandingContent>;
  return (
    typeof candidate.brandName === "string" &&
    typeof candidate.heroTitle === "string" &&
    typeof candidate.heroAccent === "string" &&
    typeof candidate.heroDescription === "string" &&
    Array.isArray(candidate.features)
  );
}

export async function getPublicLandingContent(): Promise<LandingContent> {
  try {
    const response = await backendFetch("/public/content/landing", {
      method: "GET",
    });
    const payload = (await readJson(response)) as Partial<PublicLandingPayload> | null;
    if (response.ok && payload && isLandingContent(payload.content)) {
      return payload.content;
    }
  } catch {
    // The public entry point remains usable with the safe code-versioned fallback.
  }

  return FALLBACK_LANDING_CONTENT;
}
