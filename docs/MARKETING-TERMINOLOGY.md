# FixTradeZone — Marketing Terminology Preference

Status: Founder-requested marketing copy standard, recorded 2026-10-08.
Scope: Draft marketing content, campaign planning, public-facing promotional copy.
This document does not certify feature availability or authorize application/UI/API changes.

## Preferred wording

Use **Algorithm-Generated Trade Activity** as the primary phrase when describing the relevant product concept in marketing materials.

Avoid using **Simulated Trade Activity** or **SIMULATED RESULTS** as promotional headlines, campaign taglines, or general brand positioning.

## Accuracy and mandatory disclosure

The preferred phrase is a naming convention, **not** a representation that users execute real trades. Plain-language explanations must make clear that algorithm-generated activity is not real-market trade execution, that generated results are not actual trading profits, and that the activity does not by itself establish withdrawable earnings.

Suggested explanatory copy:

> Algorithm-generated trade activity is created within the platform; users do not execute corresponding trades on live markets. Displayed outcomes are not real trading profits or a guarantee of earnings.

Do not promote guaranteed income, investment returns, broker/exchange execution, real-market performance, or unverified product availability.

## Relationship to existing locked decisions

This document records the Founder's marketing terminology preference. It **does not silently amend or override** locked truthfulness/disclosure obligations in `docs/DECISIONS.md` (especially ADR-008 and ADR-027), the product's required labeling in applicable UI/results contexts, or any regulatory advertising requirement.

Any change to mandatory in-product disclosure text, historical architectural decisions, or application behavior requires separate review, an explicit versioned decision, and appropriate verification.

## Delivery status

Marketing-only documentation change. No runtime code, API contracts, data, migration, or production configuration changed. Live/current feature status must be verified against the repository before publication. In particular, historical draft marketing mentioning v1 AI Agents must not be reused: ADR-027 excludes that milestone.
