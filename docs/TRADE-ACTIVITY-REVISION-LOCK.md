# FixTradeZone — Trade Activity Revision Lock

Status: LOCKED / CLIENT REVISION
Date: 2026-09-04

This document amends the presentation and scheduling portions of `SIMULATED-TRADE-ACTIVITY-LOCK.md`. All financial-isolation, determinism, idempotency, immutable-history, RBAC, worker-safety and publication-boundary rules from SIM-01 remain in force unless explicitly amended below.

## Client-facing terminology

Client-facing ADMIN/USER navigation, page headings, labels and table columns use **Trade Activity**, **Daily Trades**, **Trade #**, **Trade time**, **WIN/LOSS** and **Result** rather than leading with the word “Simulated”.

This terminology is a presentation change only. It must never imply that FixTradeZone executed an order on an external broker/exchange when no such execution occurred.

Every major Trade Activity workspace must retain an unambiguous disclosure equivalent to:

> Trade activity is system-generated according to your active package rules and does not represent external market execution.

Internal compatibility identifiers may remain `simulated_*`, `/simulated-activity`, `simulated_activity.*`, `SIMULATED_ACTIVITY_*` and existing immutable source keys. Renaming those internal identifiers is not required for the client-facing revision.

## Per-subscription trade scope

- Only ACTIVE package subscriptions are eligible.
- Scheduling remains per ACTIVE package subscription, never pooled at USER level.
- Default target remains 5 trades per eligible subscription per local calendar day.
- 2 ACTIVE subscriptions therefore have a configured maximum of 10 rows/day; 3 ACTIVE subscriptions have 15 rows/day under the default.
- Each subscription keeps its own deterministic source identity, asset/outcome/result selection, schedule and lifecycle eligibility.

## Configurable spacing

The versioned Trade Activity policy adds `minimumGapMinutes`.

- Recommended default for new/editable policy drafts: `240` minutes (4 hours).
- SUPER_ADMIN may configure the value within the validated policy range.
- `0` means the legacy no-minimum-gap scheduler.
- Historical PUBLISHED policy versions migrated with `NULL` preserve their legacy scheduling behavior and are never rewritten merely to adopt the new spacing rule.
- Cloning a legacy PUBLISHED policy with `NULL` spacing into a new DRAFT applies the current recommended 240-minute default; the new draft must pass timing-window validation before publication.
- Existing DRAFT rows receive the 240-minute default during forward migration because drafts have not produced immutable effective history.

The scheduler is deterministic: the same subscription/policy/local-date/slot inputs always reproduce the same scheduled instant. Different subscriptions independently derive their own schedules.

## Timing-window fail-closed rule

Policy validation must prove that all configured daily trades can fit inside the configured local timing windows while respecting `minimumGapMinutes`.

For five trades with a 240-minute minimum gap, the first-to-last scheduled span must be at least 16 hours. A single `09:00-21:00` window therefore cannot satisfy that configuration and must be rejected rather than silently compressing gaps.

A full-day-like window such as `00:00-23:59` can support the default five-trade/four-hour configuration. Exact scheduled minutes remain deterministic and subscription-specific.

## Financial and execution boundary

Trade Activity remains isolated from accounting:

- no Main Wallet mutation;
- no Package Earnings ledger posting;
- no referral commission mutation;
- no reward/cap mutation;
- no deposit/subscription funding mutation;
- no arbitrary ADMIN-entered WIN/LOSS/result;
- no Buy/Sell/Close external-execution controls; and
- API snapshots continue to report `financialEffect: NONE`.

Trade Activity rows are not evidence of an external broker/exchange fill. Any future real-execution integration would require a separately approved architecture and cannot be inferred from these rows.

## Routes and compatibility

Client-facing browser routes:

- ADMIN: `/trade-activity`
- USER: `/user/trade-activity`

Legacy browser routes redirect:

- `/simulated-trades` → `/trade-activity`
- `/user/simulated-activity` → `/user/trade-activity`

Existing internal BFF/backend API paths and RBAC permission codes remain unchanged for compatibility.

## Acceptance workflow

Current project workflow supersedes the older Postman-first SIM-01 acceptance wording:

1. verify branch/HEAD/status and forward-migration state locally;
2. run backend/frontend build, lint, typecheck and automated tests;
3. browser/UI acceptance first;
4. use Postman if UI/API behavior is doubtful or a targeted API proof is needed;
5. use SQL/readback proof when required for generated-event immutability/idempotency; this revision itself creates no financial ledger mutation;
6. update docs/commit/push;
7. raise PR to `main` only after local acceptance is GREEN.

## Minimum browser acceptance

- ADMIN sidebar shows `Trade Activity` and opens `/trade-activity`.
- USER sidebar shows `Daily Trades` and opens `/user/trade-activity`.
- Legacy browser URLs redirect correctly.
- Draft policy exposes trades/day and minimum gap.
- `5 trades + 240 minutes + 09:00-21:00` is rejected as impossible.
- A sufficiently wide timing window with `5 + 240` saves successfully.
- USER history labels rows as trades while preserving the external-execution disclosure.
- Multiple ACTIVE subscriptions remain independent; configured maximum is five rows/day per subscription under the default.
- Historical generated rows remain immutable and no wallet/ledger/accounting mutation is introduced by this revision.
