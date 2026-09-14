import type { Metadata } from "next";
import Link from "next/link";
import {
  getPublicLandingContent,
  getPublicPackageCatalogue,
  type PublicPackageSummary,
} from "@/lib/public-content";
import styles from "./landing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicLandingContent();

  return {
    title: content.seoTitle,
    description: content.seoDescription,
  };
}

function formatNumber(value: string | null): string {
  if (!value) return "—";

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(parsed);
}

function investmentLabel(item: PublicPackageSummary): string {
  const minimum = formatNumber(item.minimumInvestment);
  const maximum = item.maximumInvestment
    ? formatNumber(item.maximumInvestment)
    : null;

  if (maximum && maximum !== minimum) {
    return `${minimum} – ${maximum} ${item.currency}`;
  }

  return `${minimum} ${item.currency}`;
}

export default async function Home() {
  const [content, catalogue] = await Promise.all([
    getPublicLandingContent(),
    getPublicPackageCatalogue(),
  ]);

  const signInCta = [
    { label: content.primaryCtaLabel, href: content.primaryCtaHref },
    { label: content.secondaryCtaLabel, href: content.secondaryCtaHref },
  ].find((cta) => cta.href === "/login") ?? {
    label: "Sign in",
    href: "/login",
  };

  return (
    <main className={styles.page}>
      <div className={styles.gridGlow} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${content.brandName} home`}>
          <span className={styles.brandMark}>FTZ</span>
          <span>{content.brandName}</span>
        </Link>

        <nav className={styles.nav} aria-label="Public navigation">
          <a className={styles.navLink} href="#packages">
            Packages
          </a>
          <a className={styles.navLink} href="#how-it-works">
            How it works
          </a>
          <a className={styles.navLink} href="#team-business">
            Team
          </a>
          <a className={styles.signIn} href={signInCta.href}>
            {signInCta.label}
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.badge}>
            <span aria-hidden="true">◆</span>
            {content.badge}
          </span>

          <h1>
            {content.heroTitle}{" "}
            <span>{content.heroAccent}</span>
          </h1>

          <p className={styles.heroDescription}>{content.heroDescription}</p>

          <div className={styles.actions}>
            <a className={styles.primaryAction} href={content.primaryCtaHref}>
              {content.primaryCtaLabel}
              <span aria-hidden="true">→</span>
            </a>
            <a className={styles.secondaryAction} href={content.secondaryCtaHref}>
              {content.secondaryCtaLabel}
            </a>
          </div>

          <div className={styles.assurance}>
            <span>
              <b aria-hidden="true">✓</b> Simple package access
            </span>
            <span>
              <b aria-hidden="true">✓</b> Team visibility
            </span>
            <span>
              <b aria-hidden="true">✓</b> Wallet & payout tracking
            </span>
          </div>
        </div>

        <div className={styles.journeyCard} aria-label="FixTradeZone journey overview">
          <span className={styles.cardEyebrow}>YOUR FIXTRADEZONE JOURNEY</span>
          <div className={styles.journeyStep}>
            <span>01</span>
            <div>
              <strong>Choose</strong>
              <small>Explore the packages currently available.</small>
            </div>
          </div>
          <div className={styles.journeyStep}>
            <span>02</span>
            <div>
              <strong>Build</strong>
              <small>Grow your referral network and team visibility.</small>
            </div>
          </div>
          <div className={styles.journeyStep}>
            <span>03</span>
            <div>
              <strong>Track</strong>
              <small>Follow package, wallet and payout activity in one account.</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="packages" aria-labelledby="packages-title">
        <div className={styles.sectionHeading}>
          <span>PACKAGES</span>
          <h2 id="packages-title">Explore available packages.</h2>
          <p>
            Package cards below come from the current published package plan, so the
            public page stays aligned with the platform catalogue.
          </p>
        </div>

        {catalogue.catalogueAvailable && catalogue.items.length > 0 ? (
          <div className={styles.packageGrid}>
            {catalogue.items.map((item) => (
              <article className={styles.packageCard} key={item.slug}>
                <div className={styles.packageTop}>
                  <span>AVAILABLE PACKAGE</span>
                  <i aria-hidden="true">◆</i>
                </div>
                <h3>{item.displayName}</h3>
                <div className={styles.packageAmount}>{investmentLabel(item)}</div>
                <div className={styles.packageMeta}>
                  <span>
                    <small>Daily trading</small>
                    <strong>0.4–0.6% USER net / day</strong>
                  </span>
                  <span>
                    <small>Duration</small>
                    <strong>{item.durationDays} days</strong>
                  </span>
                  <span>
                    <small>Currency</small>
                    <strong>{item.currency}</strong>
                  </span>
                </div>
                <a className={styles.packageAction} href={content.primaryCtaHref}>
                  Get started <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyPackages}>
            <strong>Packages will be available soon.</strong>
            <span>Check back shortly or sign in for the latest account information.</span>
          </div>
        )}

        <p className={styles.packageNote}>
          Package availability and terms can change. Review the current package details
          in your account before activation.
        </p>
      </section>

      <section
        className={styles.section}
        id="how-it-works"
        aria-labelledby="how-it-works-title"
      >
        <div className={styles.sectionHeading}>
          <span>HOW IT WORKS</span>
          <h2 id="how-it-works-title">Start in a few simple steps.</h2>
        </div>

        <div className={styles.featureGrid}>
          {content.features.map((feature, index) => (
            <article className={styles.featureCard} key={`${feature.title}-${index}`}>
              <span className={styles.featureNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.teamSection} id="team-business">
        <div className={styles.teamCopy}>
          <span className={styles.cardEyebrow}>TEAM BUSINESS</span>
          <h2>{content.trustTitle}</h2>
          <p>{content.trustDescription}</p>
          <a className={styles.secondaryAction} href={content.primaryCtaHref}>
            Create your account
          </a>
        </div>

        <div className={styles.teamGrid}>
          <article>
            <span aria-hidden="true">↗</span>
            <strong>Invite</strong>
            <p>Share your referral link with people you know.</p>
          </article>
          <article>
            <span aria-hidden="true">◇</span>
            <strong>Grow</strong>
            <p>Build your network around eligible package activity.</p>
          </article>
          <article>
            <span aria-hidden="true">◎</span>
            <strong>Track</strong>
            <p>Follow direct referrals, genealogy and eligible team business.</p>
          </article>
        </div>
      </section>

      <section className={styles.benefits} aria-label="FixTradeZone account benefits">
        <article>
          <strong>Package visibility</strong>
          <span>See your available and active packages clearly.</span>
        </article>
        <article>
          <strong>Referral tracking</strong>
          <span>Follow direct referrals and team structure.</span>
        </article>
        <article>
          <strong>Wallet history</strong>
          <span>Review account credits, debits and balances.</span>
        </article>
        <article>
          <strong>Payout access</strong>
          <span>Track eligible withdrawal and payout activity.</span>
        </article>
      </section>

      <section className={styles.finalCta}>
        <div>
          <span className={styles.cardEyebrow}>READY TO START?</span>
          <h2>Open your FixTradeZone account.</h2>
          <p>Choose a package, build your network and manage everything from one workspace.</p>
        </div>
        <div className={styles.actions}>
          <a className={styles.primaryAction} href={content.primaryCtaHref}>
            {content.primaryCtaLabel}
            <span aria-hidden="true">→</span>
          </a>
          <a className={styles.secondaryAction} href={content.secondaryCtaHref}>
            {content.secondaryCtaLabel}
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>{content.footerText}</span>
        <span>© {new Date().getUTCFullYear()} {content.brandName}</span>
      </footer>
    </main>
  );
}
