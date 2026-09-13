export const CONTENT_KEYS = {
  LANDING_PAGE: 'LANDING_PAGE',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  WELCOME: 'WELCOME',
  MARKETING_OFFER: 'MARKETING_OFFER',
  DELIVERY_TEST: 'DELIVERY_TEST',
} as const;

export type ContentKey = (typeof CONTENT_KEYS)[keyof typeof CONTENT_KEYS];
export type EmailContentKey = Exclude<ContentKey, 'LANDING_PAGE'>;

export type EmailTemplateCategory =
  | 'AUTH'
  | 'FINANCE'
  | 'SUPPORT'
  | 'MARKETING'
  | 'SYSTEM';

export interface EmailTemplateDefinition {
  label: string;
  category: EmailTemplateCategory;
  description: string;
  transactional: boolean;
}

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

export const EMAIL_TEMPLATE_DEFINITIONS: Record<
  EmailContentKey,
  EmailTemplateDefinition
> = {
  EMAIL_VERIFICATION: {
    label: 'Email verification',
    category: 'AUTH',
    description:
      'Transactional account-verification message with a short-lived secure action link.',
    transactional: true,
  },
  PASSWORD_RESET: {
    label: 'Password reset',
    category: 'AUTH',
    description:
      'Transactional password-recovery message with a short-lived one-time action link.',
    transactional: true,
  },
  WELCOME: {
    label: 'Welcome / signup',
    category: 'AUTH',
    description:
      'Welcome message for a newly ready FixTradeZone account. Event wiring remains controlled by the account lifecycle.',
    transactional: true,
  },
  MARKETING_OFFER: {
    label: 'Marketing offer',
    category: 'MARKETING',
    description:
      'Promotional template for eligible recipients. Delivery must respect marketing consent and preference rules.',
    transactional: false,
  },
  DELIVERY_TEST: {
    label: 'Delivery diagnostic',
    category: 'SYSTEM',
    description:
      'Controlled SUPER_ADMIN diagnostic used to verify the configured email transport.',
    transactional: true,
  },
};

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
  WELCOME: {
    subject: 'Welcome to FixTradeZone',
    preheader: 'Your FixTradeZone account is ready.',
    headline: 'Welcome to FixTradeZone',
    body: 'Hello {{displayName}}, your FixTradeZone account {{userCode}} is ready. Explore your dashboard, review available packages, manage deposits and wallet activity, and stay updated with account notifications.',
    ctaLabel: 'Open FixTradeZone',
    footer:
      'Keep your login and verification details secure. FixTradeZone will never ask you to share your password.',
  },
  MARKETING_OFFER: {
    subject: '{{offerTitle}} | FixTradeZone',
    preheader: '{{offerSummary}}',
    headline: '{{offerTitle}}',
    body: 'Hello {{displayName}}, {{offerSummary}} Review the offer details in FixTradeZone before taking any action.',
    ctaLabel: 'View offer',
    footer:
      'This is a promotional message. Manage your communication preferences here: {{unsubscribeUrl}}',
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
  WELCOME: ['displayName', 'userCode', 'appUrl'],
  MARKETING_OFFER: [
    'displayName',
    'offerTitle',
    'offerSummary',
    'offerUrl',
    'unsubscribeUrl',
  ],
  DELIVERY_TEST: ['requestedBy', 'appUrl'],
};

export function isEmailContentKey(value: string): value is EmailContentKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_EMAIL_CONTENT, value);
}
