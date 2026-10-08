# FixTradeZone — Marketing Terminology and Product Messaging

Status: Founder-confirmed marketing messaging clarification, 2026-10-08.
Scope: Draft marketing content, campaign planning, and promotional copy.
This document does not certify live feature availability or authorize UI/API/business-rule changes.

## Positioning and approved terminology

**Approved brand category: Algorithm-Based Trading Platform.** Do not prefix the public brand category, tagline, headline, or introductory marketing description with “Internal.” Technical descriptions of the settlement architecture may still identify internal processing when needed for accuracy.

Describe the platform workflow as follows:

1. **Algorithm-Generated Trade Activity** — daily activity generated and recorded by the internal algorithm.
2. **Internal Trading and Earnings** — the financial interpretation/settlement of existing daily activity according to applicable package terms, platform rules, and limits.
3. **Wallet** — eligible settled amounts are recorded through the authoritative accounting flow.
4. **Payout or Reinvestment** — eligible wallet amounts can be requested for payout or reinvested, subject to relevant policies and validations.

Prefer **Algorithm-Generated Trade Activity**, **Daily Earnings**, **Internal Trading**, **Wallet**, **Payout**, and **Reinvestment** where accurate.

Avoid **Simulated Trade Activity** or **SIMULATED RESULTS** as promotional headlines, taglines, and general brand positioning. This preference does not authorize removal of required in-product labels or disclosures under existing locked decisions.

## Copy accuracy

Do not write blanket claims that **all displayed outcomes are not real earnings** or **all platform balances cannot be withdrawn**. Those claims conflate display-only daily activity with separately settled financial entitlements and would inaccurately describe the documented wallet/payout workflow.

Also do not claim that an algorithm-generated daily activity record **automatically** creates a payable balance. Daily activity is display-only until the authoritative Internal Trading settlement processes it. Eligible credits, caps, payout eligibility, reinvestment, and transaction status must reflect the actual platform rules.

Do not portray internal algorithm-generated activity as orders executed through an external exchange or brokerage. Do not promise guaranteed, fixed, risk-free, or unconditional daily returns. The Founder describes a daily profit/earnings business model; the precise obligations and permissible advertising claims require verification against applicable package contracts, payout policies, current implementation, and legal requirements.

### Preferred general copy

> FixTradeZone is an algorithm-based trading platform built around daily algorithm-generated activity, package-based earnings settlement, wallet management, and payout or reinvestment options. Eligible earnings are credited according to applicable package terms and settlement rules. Users can request payouts or reinvest eligible balances in accordance with platform policies.

### Explanatory disclosure when context requires it

> Trading activity is generated within FixTradeZone's internal system; it does not represent trades executed through an external broker or exchange. Displayed daily activity and settled wallet earnings are distinct. Payouts and reinvestment depend on eligible settled balances and applicable terms.

## Marketing asset formats, links, and distribution — Founder-approved

- **Facebook / Instagram image posts:** use PNG (or another platform-supported image format) for the poster. A URL printed inside a PNG is **not** an embedded clickable hyperlink; include the complete `https://fixtradezone.com` URL in the post caption as an actionable link where the platform makes it clickable. For paid advertisements, configure the platform's supported website destination and CTA button (for example, Learn More) rather than assuming text drawn into an image will be clickable.
- **PDF brochures and documents:** when requested for WhatsApp, Telegram, email, or other document-sharing workflows, create a PDF that contains an actual clickable hyperlink to `https://fixtradezone.com` (not merely text that looks like a URL). The receiving app or PDF viewer controls whether the hyperlink is activated.
- **QR codes:** optional on PNG or PDF when a scannable website destination adds value; verify the encoded URL.
- **Format selection:** default to a Facebook-ready PNG for Facebook poster requests; provide a clickable-link PDF version **when requested or useful for the stated sharing context**. Do not automatically create both formats for every creative.
- **File naming:** use descriptive, channel-specific names (for example, `FixTradeZone_Facebook_Wallet_Payout_Reinvestment_USDT_BEP20.png` and a matching `.pdf` when created); avoid `image.png`, `default`, or unexplained generated filenames.
- **Brand/currency consistency:** use the Founder-approved original `fixtradezone_final_logo.png` as the unchanged logo source for assets, and use `USDT (BEP-20)` where the relevant wallet network is shown. Avoid unrelated currency symbols and wrong network labels. Do not substitute a recreated/generated logo.
- **Truthful claims:** asset format and clickable-link choices do not change product truthfulness, eligibility, or platform advertising requirements.

## Current-state and governance boundaries

The canonical trading checkpoint describes **Daily Trade = immutable source identity/result -> Internal Trading = financial interpretation/settlement**. Daily Trade generation alone has no direct wallet effect. Internal Trading owns financial settlement and package caps. The payout workflow separately validates eligibility and saved withdrawal destination.

Existing locked decisions in `docs/DECISIONS.md` (especially ADR-008 and ADR-027) still govern product truthfulness and required product labeling. This marketing document does not silently amend those decisions, change historical records, or permit presenting internally generated activity as real exchange execution.

Any mandatory in-product label or business-rule changes require a separate, explicitly approved and versioned decision. No application code, migration, accounting data, or production settings are modified by this document.

Do not market planned capabilities as already launched. In particular, ADR-027 excludes an AI Agents/trading-engine milestone from v1; old campaign drafts that imply it is live or committed to v1 must be corrected before publication.

## Founder-requested Flow campaign positioning — 2026-10-08 (CLAIM GATE)

- The Founder requested the exact marketing category string **`Algorithm & AI-Based Trading Platform`**, replacing the earlier `Algorithm-Based Trading Platform` wording **as a desired campaign direction**.
- **This is not a verified live feature claim or an automatic approval to advertise an AI trading engine.** Locked ADR-027 currently excludes AI Agents / an AI trading engine in v1. Only describe the platform publicly as AI-based in a way that implies implemented trading functionality after that functionality and claim scope are substantiated, approved, and documented. Until then, use the verified `Algorithm-Based Trading Platform` classification for factual public claims, with AI-inspired visuals as creative direction.
- **Google Flow production rules (including Founder preference for Flow-generated voice rather than separately merged Gemini audio), creative direction, exact official logo filename, four-video campaign plan, and new-chat handoff:** see [GOOGLE-FLOW-CINEMATIC-PRODUCTION.md](./GOOGLE-FLOW-CINEMATIC-PRODUCTION.md).
- Google Flow Agent Instructions and the original `fixtradezone_final_logo.png` media reference were already set/uploaded by the Founder in Flow. **Do not start video 2 or later until Video 1 is approved; generate one 8-second intro scene at a time only when explicitly requested.** All later prompts must be self-contained and must not require manual facts blocks.
