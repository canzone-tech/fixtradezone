export const CONTENT_KEYS = {
  LANDING_PAGE: 'LANDING_PAGE',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  DELIVERY_TEST: 'DELIVERY_TEST',
} as const;

export type ContentKey = (typeof CONTENT_KEYS)[keyof typeof CONTENT_KEYS];
export type EmailContentKey = Exclude<ContentKey, 'LANDING_PAGE'>;

export const LANDING_TEMPLATE_KEY = 'DARK_NEO_V1';
export const EMAIL_TEMPLATE_KEY = 'BRANDED_EMAIL_V1';

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

export interface EmailTemplateContent {
  [key: string]: string;
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  ctaLabel: string;
  footer: string;
}

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  brandName: 'FixTradeZone',
  badge: 'SECURE DIGITAL ASSET PLATFORM',
  heroTitle: 'Operate your account with',
  heroAccent: 'clarity and control.',
  heroDescription:
    'A secure workspace for packages, deposits, referral activity, rewards, payouts and clearly labelled simulated activity.',
  primaryCtaLabel: 'Sign in',
  primaryCtaHref: '/login',
  secondaryCtaLabel: 'Create account',
  secondaryCtaHref: '/register',
  features: [
    {
      title: 'Account operations',
      description:
        'Manage package, deposit, wallet and payout workflows from one protected account.',
    },
    {
      title: 'Referral visibility',
      description:
        'Review direct referrals, genealogy and eligible package-based commission activity.',
    },
    {
      title: 'Transparent activity',
      description:
        'Simulated results are clearly disclosed and remain separate from real wallet and ledger accounting.',
    },
  ],
  trustTitle: 'Security-first account boundary',
  trustDescription:
    'Protected authentication, role-based access controls, session security and immutable accounting records support platform operations.',
  disclosure:
    'SIMULATED RESULTS ARE NOT REAL TRADING. Displayed simulated activity does not represent exchange execution or guaranteed, realized or withdrawable trading profit.',
  footerText: 'FixTradeZone — secure platform operations.',
  seoTitle: 'FixTradeZone | Secure Platform Operations',
  seoDescription:
    'Secure FixTradeZone access for packages, deposits, referrals, rewards, payouts and clearly disclosed simulated activity.',
};

export const DEFAULT_EMAIL_CONTENT: Record<
  EmailContentKey,
  EmailTemplateContent
> = {
  EMAIL_VERIFICATION: {
    subject: 'Verify your FixTradeZone email',
    preheader: 'Confirm your email address to continue using FixTradeZone.',
    headline: 'Verify your email address',
    body: 'Hello {{displayName}}, confirm this email address for your FixTradeZone account. This link expires in {{expiresInMinutes}} minutes.',
    ctaLabel: 'Verify email',
    footer: 'If you did not create this account, you can ignore this message.',
  },
  PASSWORD_RESET: {
    subject: 'Reset your FixTradeZone password',
    preheader: 'Use the secure link to set a new FixTradeZone password.',
    headline: 'Reset your password',
    body: 'Hello {{displayName}}, a password reset was requested for your FixTradeZone account. This link expires in {{expiresInMinutes}} minutes.',
    ctaLabel: 'Reset password',
    footer: 'If you did not request this change, you can ignore this message.',
  },
  DELIVERY_TEST: {
    subject: 'FixTradeZone email delivery test',
    preheader:
      'This controlled message confirms the configured email transport.',
    headline: 'Email delivery test',
    body: 'This is a controlled FixTradeZone email delivery test requested by {{requestedBy}}.',
    ctaLabel: 'Open FixTradeZone',
    footer: 'No account or financial state was changed by this test.',
  },
};

export const EMAIL_ALLOWED_VARIABLES: Record<
  EmailContentKey,
  readonly string[]
> = {
  EMAIL_VERIFICATION: ['displayName', 'verificationUrl', 'expiresInMinutes'],
  PASSWORD_RESET: ['displayName', 'resetUrl', 'expiresInMinutes'],
  DELIVERY_TEST: ['requestedBy', 'appUrl'],
};

export function isEmailContentKey(value: string): value is EmailContentKey {
  return (
    value === CONTENT_KEYS.EMAIL_VERIFICATION ||
    value === CONTENT_KEYS.PASSWORD_RESET ||
    value === CONTENT_KEYS.DELIVERY_TEST
  );
}
