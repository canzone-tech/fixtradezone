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

export interface PublicPackageSummary {
  displayName: string;
  slug: string;
  sortOrder: number;
  availability: string;
  price: string;
  minimumInvestment: string;
  maximumInvestment: string | null;
  rangeConfigured: boolean;
  durationDays: number;
  currency: string;
  networkCode: string | null;
  dailyRateLabel: string | null;
}

export interface PublicPackageCatalogue {
  catalogueAvailable: boolean;
  items: PublicPackageSummary[];
}

interface PublicLandingPayload {
  templateKey: string;
  content: LandingContent;
  source: "PUBLISHED_REVISION" | "DEFAULT";
}

export const FALLBACK_LANDING_CONTENT: LandingContent = {
  brandName: "FixTradeZone",
  badge: "DIGITAL ASSET PLATFORM",
  heroTitle: "Build your journey with",
  heroAccent: "FixTradeZone.",
  heroDescription:
    "Choose a package, manage your account, grow your network and track your progress from one simple workspace.",
  primaryCtaLabel: "Get started",
  primaryCtaHref: "/register",
  secondaryCtaLabel: "Sign in",
  secondaryCtaHref: "/login",
  features: [
    {
      title: "Choose a package",
      description:
        "Explore the available packages and select the option that fits your plan.",
    },
    {
      title: "Activate your account",
      description:
        "Complete the required account steps and follow your package status from your dashboard.",
    },
    {
      title: "Build your network",
      description:
        "Invite your team, track referrals and follow eligible team business from one place.",
    },
  ],
  trustTitle: "Grow with clear team visibility",
  trustDescription:
    "Use your referral link, follow your direct network and genealogy, and track eligible package-based team activity from your account.",
  disclosure:
    "SIMULATED RESULTS ARE NOT REAL TRADING. Displayed simulated activity does not represent exchange execution or guaranteed, realized or withdrawable trading profit.",
  footerText: "FixTradeZone — simple, secure account access.",
  seoTitle: "FixTradeZone | Packages, Team Business & Account Access",
  seoDescription:
    "Explore FixTradeZone packages, manage your account, follow referrals and team activity, and access wallet and payout features from one protected workspace.",
};

const EMPTY_PACKAGE_CATALOGUE: PublicPackageCatalogue = {
  catalogueAvailable: false,
  items: [],
};

function isStringWithin(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isSafeHref(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) {
    return false;
  }

  const href = value.trim();

  if (href.startsWith("/") && !href.startsWith("//")) {
    return true;
  }

  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

function isLandingContent(value: unknown): value is LandingContent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<LandingContent>;
  const features = candidate.features;

  return (
    isStringWithin(candidate.brandName, 80) &&
    isStringWithin(candidate.badge, 100) &&
    isStringWithin(candidate.heroTitle, 180) &&
    isStringWithin(candidate.heroAccent, 120) &&
    isStringWithin(candidate.heroDescription, 800) &&
    isStringWithin(candidate.primaryCtaLabel, 60) &&
    isSafeHref(candidate.primaryCtaHref) &&
    isStringWithin(candidate.secondaryCtaLabel, 60) &&
    isSafeHref(candidate.secondaryCtaHref) &&
    Array.isArray(features) &&
    features.length >= 1 &&
    features.length <= 6 &&
    features.every(
      (feature) =>
        typeof feature === "object" &&
        feature !== null &&
        !Array.isArray(feature) &&
        isStringWithin((feature as LandingFeatureContent).title, 80) &&
        isStringWithin((feature as LandingFeatureContent).description, 320),
    ) &&
    isStringWithin(candidate.trustTitle, 160) &&
    isStringWithin(candidate.trustDescription, 700) &&
    isStringWithin(candidate.disclosure, 1000) &&
    isStringWithin(candidate.footerText, 240) &&
    isStringWithin(candidate.seoTitle, 120) &&
    isStringWithin(candidate.seoDescription, 320)
  );
}

function isPublicPackageSummary(value: unknown): value is PublicPackageSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as Partial<PublicPackageSummary>;

  return (
    isStringWithin(item.displayName, 120) &&
    isStringWithin(item.slug, 160) &&
    typeof item.sortOrder === "number" &&
    Number.isFinite(item.sortOrder) &&
    isStringWithin(item.availability, 40) &&
    isStringWithin(item.price, 40) &&
    isStringWithin(item.minimumInvestment, 40) &&
    (item.maximumInvestment === null ||
      isStringWithin(item.maximumInvestment, 40)) &&
    typeof item.rangeConfigured === "boolean" &&
    typeof item.durationDays === "number" &&
    Number.isFinite(item.durationDays) &&
    item.durationDays > 0 &&
    isStringWithin(item.currency, 16) &&
    (item.networkCode === null || isStringWithin(item.networkCode, 40)) &&
    (item.dailyRateLabel === null || isStringWithin(item.dailyRateLabel, 40))
  );
}

export async function getPublicLandingContent(): Promise<LandingContent> {
  try {
    const response = await backendFetch("/public/content/landing", {
      method: "GET",
    });
    const payload = (await readJson(response)) as
      | Partial<PublicLandingPayload>
      | null;

    if (response.ok && payload && isLandingContent(payload.content)) {
      return payload.content;
    }
  } catch {
    // The public entry point remains usable with the safe code-versioned fallback.
  }

  return FALLBACK_LANDING_CONTENT;
}

export async function getPublicPackageCatalogue(): Promise<PublicPackageCatalogue> {
  try {
    const response = await backendFetch("/public/packages", {
      method: "GET",
    });
    const payload = (await readJson(response)) as
      | Partial<PublicPackageCatalogue>
      | null;

    if (
      response.ok &&
      payload &&
      typeof payload.catalogueAvailable === "boolean" &&
      Array.isArray(payload.items) &&
      payload.items.every(isPublicPackageSummary)
    ) {
      return {
        catalogueAvailable: payload.catalogueAvailable,
        items: [...payload.items].sort((a, b) => a.sortOrder - b.sortOrder),
      };
    }
  } catch {
    // Public landing remains usable when catalogue data is temporarily unavailable.
  }

  return EMPTY_PACKAGE_CATALOGUE;
}
