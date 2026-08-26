# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-26

This file is the current operational checkpoint for FixTradeZone. Repository state and local verification remain the final acceptance authority.

## Mainline

MLM-01 Referral Foundation is complete, merged into `main`, and locally reverified.

- PR #15 merged.
- Main merge commit: `2a06487b23d2c9cb0bc2078e93bde6eba220c42d`.
- Mainline referral/API/UI acceptance: GREEN.

## Active Branch

`feature/packages-foundation`

The branch is ahead of `main` and contains the completed PKG-01 package slice plus full-app PWA/local-HTTPS improvements and the latest roadmap/decision corrections.

## PKG-01 — Packages / Plan Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

Accepted implementation:

- migration `0007_package_plan_foundation`;
- immutable package definitions;
- atomic versioned plan/version-item aggregate;
- nine-package V1 plan;
- audited draft/update/clone/publish workflow;
- SUPER_ADMIN-only publication controls;
- optimistic plan revisions;
- exact decimal strings for all package economics;
- immutable published commercial terms;
- protected package APIs;
- same-origin ADMIN/USER BFF routes;
- Dark Neo `/packages` admin workspace;
- Dark Neo `/user/packages` user catalogue;
- full-app PWA scope `/` with trusted local HTTPS/LAN acceptance;
- static-only safe service-worker caching; no sensitive API/business state caching.

Final local acceptance:

- ordered PKG-01 Postman API run: GREEN;
- SQL package/audit readback: GREEN;
- migration status: 7 migrations, schema up to date;
- backend Prisma validation: GREEN;
- backend Prettier + ESLint: GREEN;
- backend Jest: 26/26 suites, 148/148 tests;
- Nest production build: GREEN;
- backend diff gate: GREEN;
- admin ESLint: GREEN;
- admin TypeScript: GREEN;
- Next.js 16.3.1 production build: GREEN, 44 routes;
- final local working tree was clean before the documentation checkpoint updates.

PKG-01 intentionally contains no package purchase, activation, balance, earning, deposit, subscription or ledger mutation.

## Product Scope Correction — LOCKED

There is **no AI Agents milestone in FixTradeZone v1**.

Older backbone/roadmap references to `AI Agents` are superseded by the Founder's later scope decision. FixTradeZone does not execute real trades and will not implement an AI trading engine, broker/exchange execution, strategy execution or automated trading.

Future trade-like presentation is limited to explicitly labelled **Simulated Trade Activity** / **SIMULATED RESULTS**. It must never be represented as real trading or realized/withdrawable trading profit.

## Immediate Next Milestone

### DEP-01A — Deposit Accounts / USDT TRC20 Receiving Accounts

Next implementation after PKG-01 handoff.

Locked foundation:

- ADMIN/SUPER_ADMIN manages multiple public USDT TRC20 receiving accounts;
- no private keys or seed phrases are ever stored;
- receiving accounts have explicit active/disabled lifecycle;
- account changes are authorized and audited;
- backend chooses eligible active accounts; USER never chooses the receiving account;
- deposit/account data remains in MySQL.

### DEP-01B — Deposits / TXID / Manual Approval

Immediately follows DEP-01A.

Locked flow:

1. USER initiates a deposit/payment flow.
2. Backend randomly assigns one eligible active USDT TRC20 receiving account.
3. Assigned `depositAccountId` is persisted with the deposit.
4. USER sees only the assigned public wallet address + QR.
5. USER sends USDT and submits the TXID manually.
6. Deposit becomes `PENDING` / `PENDING_REVIEW`.
7. Authorized ADMIN/SUPER_ADMIN manually verifies and APPROVES or REJECTS.
8. Duplicate TXIDs are rejected.
9. Approval/rejection is audited and idempotent.
10. Deposit approval itself does not silently mutate balances; controlled ledger/accounting integration follows in the Wallet/Ledger milestone.

Financial invariants:

- SQL `DECIMAL` only for money;
- no FLOAT/DOUBLE for financial values;
- no client-supplied value is sufficient to credit funds;
- financial writes use authorization, source-of-truth validation, transaction boundaries, idempotency and immutable audit/history;
- no blockchain auto-verification in DEP-01 unless explicitly approved later.

## Current V1 Sequence

1. DEP-01A Deposit Accounts
2. DEP-01B Deposits / TXID / Approval
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
- MongoDB is reserved for later document/CMS/flexible configuration use where actually required.
- Redis is transient infrastructure and should only be used when a repository feature actually needs it.
- Do not introduce new infrastructure merely because it exists in the architecture plan.

## Delivery Workflow

For every module:

1. reconcile live repo + docs;
2. lock business semantics;
3. implement one focused vertical slice;
4. test APIs locally first;
5. implement matching BFF/UI;
6. run automated local verification;
7. apply/verify DB migration explicitly;
8. complete integrated API + frontend acceptance;
9. update docs;
10. open PR to `main` only after all gates are GREEN.

Production deployment remains deferred until the required v1 product and local acceptance milestones are complete.
