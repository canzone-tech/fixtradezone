# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-26

This file is the current operational checkpoint for FixTradeZone. Repository state and local verification remain the final acceptance authority.

## Mainline

MLM-01 Referral Foundation is complete, merged into `main`, and locally reverified.

- PR #15 merged.
- Main merge commit: `2a06487b23d2c9cb0bc2078e93bde6eba220c42d`.
- Mainline referral/API/UI acceptance: GREEN.

## PKG-01 — Packages / Plan Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

Accepted implementation includes migration `0007_package_plan_foundation`, immutable package definitions, atomic versioned plan/items, nine-package V1 configuration, audited draft/update/clone/publish lifecycle, SUPER_ADMIN publication controls, exact decimal economics, protected APIs, same-origin BFF routes, Dark Neo ADMIN/USER package pages and the full-app PWA/local HTTPS foundation.

Final local PKG-01 acceptance:

- ordered Postman API run: GREEN;
- SQL package/audit readback: GREEN;
- 7 migrations / schema up to date;
- backend Prisma/Prettier/ESLint/build: GREEN;
- backend Jest: 26/26 suites, 148/148 tests;
- admin ESLint/TypeScript/Next production build: GREEN, 44 routes;
- PWA/mobile HTTPS acceptance: GREEN;
- local working tree clean at the accepted checkpoint.

PKG-01 intentionally contains no purchase, activation, balance, earning, deposit, subscription or ledger mutation.

## Active Development Branch

`feature/deposits-foundation`

Created from the accepted `feature/packages-foundation` head so DEP-01 can be completed as one backend + BFF + ADMIN + USER vertical slice before local acceptance.

## DEP-01 — USDT TRC20 Deposit Foundation

Status: **IMPLEMENTATION COMPLETE ON FEATURE BRANCH / LOCAL COMBINED ACCEPTANCE PENDING**.

Canonical contract: `docs/DEPOSITS-FOUNDATION.md`.

### DEP-01A — Receiving Accounts

Implemented:

- migration `0008_deposit_foundation`;
- `deposit_accounts` MySQL model;
- USDT/TRC20-only integrity constraints;
- immutable public receiving address after creation;
- QR image snapshot support;
- ACTIVE/INACTIVE assignment lifecycle;
- optimistic account revision;
- created/updated actor tracking;
- audit events for account create/update;
- `deposits.accounts.read` and `deposits.accounts.manage` permissions;
- ADMIN/SUPER_ADMIN account APIs;
- same-origin BFF routes;
- Dark Neo `/deposits` receiving-account management UI.

No private key, seed phrase, signing key or custody secret is stored.

### DEP-01B — Deposit Request / TXID / Manual Review

Implemented:

- `deposits` MySQL model with exact `DECIMAL(20,8)` amount;
- immutable package/payment/account assignment snapshots;
- current effective published package validation;
- backend-derived amount/currency;
- random backend selection from ACTIVE USDT TRC20 receiving accounts;
- DB-enforced one-open-deposit-per-user key;
- statuses `AWAITING_TXID`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`;
- normalized globally unique 64-hex TXID;
- manual ADMIN/SUPER_ADMIN approval/rejection with required note;
- terminal review state and reviewer/timestamp history;
- serializable mutation boundaries and concurrency conflict handling;
- audit operations for request creation, TXID submission and review;
- `deposits.read` and `deposits.review` permissions;
- USER `/deposits/me`, create and TXID APIs;
- ADMIN list/detail/review APIs;
- same-origin ADMIN/USER BFF routes;
- Dark Neo `/deposits` review queue;
- Dark Neo `/user/deposits` package selection, assigned address/QR, copy-address, TXID submission and history UI;
- ADMIN/USER navigation integration;
- focused DTO/service regression tests.

Approval in DEP-01 records a reviewed payment fact only. It deliberately does **not** create wallet balance, ledger entries, package activation, commission, reward or trading state.

### DEP-01 Local Acceptance Still Required

Do not mark DEP-01 accepted until the Founder runs the combined local gate:

1. pull/switch to `feature/deposits-foundation`;
2. regenerate Prisma client;
3. run full backend + admin code verification;
4. inspect migration status read-only;
5. explicitly deploy `0008_deposit_foundation`;
6. run DEP-01 Postman API flow;
7. verify `/deposits` and `/user/deposits` together in the browser/PWA;
8. verify SQL/audit readback;
9. run `npm run verify:milestone`;
10. confirm clean working tree.

No PR to `main` is opened until that combined gate is GREEN and explicitly approved.

## Product Scope Correction — LOCKED

There is **no AI Agents milestone in FixTradeZone v1**.

FixTradeZone does not execute real trades and will not implement an AI trading engine, broker/exchange execution, strategy execution or automated trading. Older references are superseded.

Future trade-like presentation is limited to explicitly labelled **Simulated Trade Activity** / **SIMULATED RESULTS** and must never be represented as real trading or realized/withdrawable trading profit.

## Current V1 Sequence

1. DEP-01A Deposit Accounts — implementation complete, acceptance pending
2. DEP-01B Deposits / TXID / Approval — implementation complete, acceptance pending
3. Wallet / Ledger foundation + controlled accounting credit
4. Package subscription / activation from approved payment
5. Referral commissions on legitimate package/payment events
6. Rewards / caps / lifecycle accounting
7. Simulated Trade Activity display only
8. Minimal v1 landing/template controls
9. Remaining USER/ADMIN operational slices
10. Notifications/reports required for launch
11. QA/security/release hardening
12. Production deployment

## Infrastructure / Data Ownership

- MySQL is the relational/business/accounting source of truth.
- MongoDB is reserved for later document/CMS/flexible configuration use only if a repository feature actually requires it.
- Redis is transient infrastructure and should only be used when a repository feature actually needs it.
- Do not introduce infrastructure merely because it exists in an older architecture plan.

## Delivery Workflow — CURRENT LOCK

For every product module:

1. reconcile live repo + persistent docs;
2. lock business semantics and contract;
3. implement backend/database/API and matching BFF/ADMIN/USER UI as one focused vertical slice;
4. complete focused automated regression coverage;
5. only after the vertical slice is complete, pull it to the local machine;
6. run code gate + explicit migration status/deploy;
7. run Postman/API + frontend/PWA integrated acceptance together;
8. run SQL/audit readback and milestone verification;
9. update final acceptance docs/state;
10. open PR to `main` only after all local gates are GREEN and Founder approves.

Production deployment remains deferred until the required v1 product and local acceptance milestones are complete.
