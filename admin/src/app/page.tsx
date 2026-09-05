import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleCheckBig,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { getPublicLandingContent } from "@/lib/public-content";
import styles from "./landing.module.css";

const featureIcons = [WalletCards, Network, ChartNoAxesCombined];

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicLandingContent();

  return {
    title: content.seoTitle,
    description: content.seoDescription,
  };
}

export default async function Home() {
  const content = await getPublicLandingContent();

  return (
    <main className={styles.page}>
      <div className={styles.gridGlow} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${content.brandName} home`}>
          <span className={styles.brandMark}>FTZ</span>
          <span>{content.brandName}</span>
        </Link>

        <nav className={styles.nav} aria-label="Public navigation">
          <a className={styles.navLink} href="#platform">
            Platform
          </a>
          <a className={styles.navLink} href="#security">
            Security
          </a>
          <a className={styles.signIn} href={content.primaryCtaHref}>
            {content.primaryCtaLabel}
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.badge}>
            <ShieldCheck size={15} aria-hidden="true" />
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
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className={styles.secondaryAction} href={content.secondaryCtaHref}>
              {content.secondaryCtaLabel}
            </a>
          </div>

          <div className={styles.assurance}>
            <span><CircleCheckBig size={16} /> Structured CMS content</span>
            <span><CircleCheckBig size={16} /> RBAC protected administration</span>
            <span><CircleCheckBig size={16} /> Versioned publication history</span>
          </div>
        </div>

        <div className={styles.heroPanel} aria-label="FixTradeZone platform overview">
          <div className={styles.panelTop}>
            <span>PLATFORM STATUS</span>
            <span className={styles.liveDot}>CONFIGURABLE</span>
          </div>
          <div className={styles.panelMetric}>
            <small>ACCOUNT OPERATIONS</small>
            <strong>One protected workspace</strong>
            <p>Packages, deposits, referrals, rewards, payouts and wallet visibility.</p>
          </div>
          <div className={styles.panelRows}>
            <div><span>Security boundary</span><strong>JWT + RBAC</strong></div>
            <div><span>Financial source</span><strong>Immutable ledger</strong></div>
            <div><span>Public content</span><strong>Versioned CMS</strong></div>
            <div><span>Activity disclosure</span><strong>Simulated only</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.features} id="platform" aria-labelledby="platform-title">
        <div className={styles.sectionHeading}>
          <span>FIXTRADEZONE PLATFORM</span>
          <h2 id="platform-title">Designed around controlled, auditable operations.</h2>
        </div>

        <div className={styles.featureGrid}>
          {content.features.map((feature, index) => {
            const Icon = featureIcons[index % featureIcons.length];
            return (
              <article className={styles.featureCard} key={`${feature.title}-${index}`}>
                <span className={styles.featureIcon}><Icon size={22} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.trust} id="security">
        <div>
          <span className={styles.eyebrow}>SECURITY & GOVERNANCE</span>
          <h2>{content.trustTitle}</h2>
          <p>{content.trustDescription}</p>
        </div>
        <div className={styles.trustList}>
          <span><ShieldCheck size={18} /> Deny-by-default protected APIs</span>
          <span><ShieldCheck size={18} /> Permission-scoped administration</span>
          <span><ShieldCheck size={18} /> Audited content publication</span>
        </div>
      </section>

      <section className={styles.disclosure} aria-label="Simulated activity disclosure">
        <strong>SIMULATED ACTIVITY DISCLOSURE</strong>
        <p>{content.disclosure}</p>
      </section>

      <section className={styles.finalCta}>
        <div>
          <span className={styles.eyebrow}>READY TO CONTINUE?</span>
          <h2>Access your FixTradeZone workspace.</h2>
        </div>
        <div className={styles.actions}>
          <a className={styles.primaryAction} href={content.primaryCtaHref}>
            {content.primaryCtaLabel}
            <ArrowRight size={18} />
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
