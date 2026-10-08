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

## Current-state and governance boundaries

The canonical trading checkpoint describes **Daily Trade = immutable source identity/result -> Internal Trading = financial interpretation/settlement**. Daily Trade generation alone has no direct wallet effect. Internal Trading owns financial settlement and package caps. The payout workflow separately validates eligibility and saved withdrawal destination.

Existing locked decisions in `docs/DECISIONS.md` (especially ADR-008 and ADR-027) still govern product truthfulness and required product labeling. This marketing document does not silently amend those decisions, change historical records, or permit presenting internally generated activity as real exchange execution.

Any mandatory in-product label or business-rule changes require a separate, explicitly approved and versioned decision. No application code, migration, accounting data, or production settings are modified by this document.

Do not market planned capabilities as already launched. In particular, ADR-027 excludes an AI Agents/trading-engine milestone from v1; old campaign drafts that imply it is live or committed to v1 must be corrected before publication.
