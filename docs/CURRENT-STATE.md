# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-26

Repository state plus local verification are the acceptance authority.

## Mainline

MLM-01 Referral Foundation is complete, merged into `main`, and locally reverified.

- PR #15 merged.
- Main merge commit: `2a06487b23d2c9cb0bc2078e93bde6eba220c42d`.

## PKG-01 — Packages / Plan Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

PKG-01 local API/SQL/UI/milestone acceptance is GREEN. It intentionally creates no user balance, earning, deposit, subscription or ledger mutation.

## DEP-01 — Deposit Foundation

Status: **SOURCE COMPLETE / WAL-01 INTEGRATION BASELINE**.

Canonical contract: `docs/DEPOSITS-FOUNDATION.md`.

DEP-01 provides the data-driven payment-rail and receiving-account foundation used by WAL-01:

- package amount/currency are backend authoritative;
- USER chooses an eligible payment rail/network;
- backend assigns one ACTIVE receiving account inside that selected rail;
- deposit stores immutable package, amount, address, network and validation-profile snapshots;
- transaction review remains manual ADMIN/SUPER_ADMIN approval/rejection;
- no private key/seed/signing secret is stored;
- no automatic blockchain verification is performed.

Applied migration history must never be rewritten. `0008_deposit_foundation` and `0009_deposit_network_generalization` are prerequisites for WAL-01.

## Active Development Branch

`feature/wallet-ledger-foundation`

## WAL-01 — Wallet / Immutable Ledger Foundation

Status: **BACKEND + FRONTEND IMPLEMENTED / BACKEND CI GREEN / ADMIN CI GREEN / LOCAL ACCEPTANCE PENDING**.

Canonical contract: `docs/WALLET-LEDGER-FOUNDATION.md`.

### Wallet model

USER wallet accounting is currency-scoped and bucketed:

```text
Main / Deposit
Package Earnings
Referral Commission
Rewards
-------------------
Total Wallet = sum of buckets for the same currency only
```

Different currencies are never added into one fake platform total.

At WAL-01 launch only approved deposit accounting posts into `Main / Deposit`.

`Package Earnings`, `Referral Commission`, and `Rewards` are structurally available but remain zero until their own milestones establish legitimate posting events.

Simulated Trade Activity never mutates wallet or ledger balances.

### Accounting invariant

Approved deposits are posted as immutable double-entry transactions:

```text
DEBIT   SYSTEM / DEPOSIT_CLEARING / <currency>
CREDIT  USER / MAIN / <currency>
```

The source key is deterministic and unique:

```text
DEPOSIT:<depositId>:CREDIT
```

Therefore repeated accounting requests are idempotent and cannot duplicate the financial credit.

### WAL-01 database foundation

Migration:

`0010_wallet_ledger_foundation`

Creates:

- `ledger_accounts`
- `ledger_account_balances`
- `ledger_transactions`
- `ledger_entries`
- wallet/ledger RBAC permissions

Ledger entries are accounting source-of-truth. Balance rows are transactionally maintained read models.

Balances use SQL `DECIMAL(20,8)`. Financial aggregation uses Prisma Decimal / SQL DECIMAL semantics, not JavaScript floating-point arithmetic.

### Posting safety

- only `APPROVED` deposits may be posted;
- posting occurs under serializable transaction handling;
- duplicate source key returns the already-posted transaction without creating new entries;
- each new posting contains at least one debit and one credit;
- debit total must equal credit total before transaction completion;
- negative ledger-account balance updates are rejected;
- USER account semantics are validated against deterministic account keys;
- immutable audit evidence records actor, deposit, amount, currency, debit account, credit account and balanced state;
- package activation, commissions and rewards are explicitly recorded as not applied by WAL-01.

### WAL-01 APIs

USER:

- `GET /wallet/me`

ADMIN:

- `GET /admin/wallets`
- `GET /admin/wallets/reconciliation`
- `GET /admin/ledger`
- `GET /admin/ledger/:transactionId`
- `POST /admin/deposits/:depositId/post-accounting`

Permissions:

- `wallets.read`
- `ledger.read`
- `ledger.post`

SUPER_ADMIN retains bypass behavior under the existing RBAC contract.

### WAL-01 frontend

USER:

- `/user/wallet`
- currency-scoped wallet total;
- Main / Deposit, Package Earnings, Referral Commission and Rewards buckets;
- immutable wallet activity readback.

ADMIN:

- `/wallets`
- approved deposits waiting for accounting;
- explicit `Post accounting` action;
- USER wallet bucket table;
- immutable ledger transaction list;
- debit/credit entry inspection with balanced status.

The Admin UI intentionally does not aggregate different currencies into one monetary total.

### Automated gate checkpoint

Feature-branch CI is GREEN after WAL-01 implementation and focused financial tests.

Backend CI validates:

- Prisma generate/validate;
- formatting;
- ESLint;
- unit tests;
- Nest build;
- critical dependency audit.

Focused WAL-01 tests cover:

- rejection of non-approved deposits before accounting writes;
- idempotent replay of already-posted deposit source keys;
- balanced clearing debit + USER Main credit;
- immutable audit metadata for successful posting.

Admin CI validates:

- lint;
- typecheck;
- Next build;
- critical dependency audit.

### WAL-01 local acceptance sequence

1. Pull latest `feature/wallet-ledger-foundation`.
2. Regenerate Prisma client.
3. Run root `npm run verify:local`.
4. Confirm migration status shows `0010_wallet_ledger_foundation` pending and no unexpected migration drift.
5. Deploy migration `0010` only after local code gate is GREEN.
6. Confirm DB migration status is fully up to date.
7. Start backend + frontend locally.
8. Run **frontend-first** WAL-01 acceptance:
   - USER Wallet page before accounting shows no credited Main balance for an unposted approved deposit;
   - ADMIN Wallets & Ledger shows that approved deposit under Accounting Pending;
   - ADMIN posts accounting once;
   - USER Wallet refresh shows the exact approved amount only in Main / Deposit;
   - other WAL-01 buckets remain zero;
   - ADMIN ledger detail shows equal debit and credit entries and Balanced status;
   - repeating the accounting action cannot duplicate the credit.
9. If a UI function fails, debug only that specific API/Postman flow.
10. Run SQL/audit readback for transaction, entries, balance and audit evidence.
11. Run final milestone verification.
12. Confirm clean working tree.
13. Mark WAL-01 complete only after Founder accepts the combined backend/frontend behavior.

No PR to `main` until every WAL-01 gate is GREEN and Founder explicitly approves.

## Product Scope Correction — LOCKED

There is **no AI Agents milestone in FixTradeZone v1**.

FixTradeZone does not execute real trades and will not implement AI/broker/exchange strategy execution. Future trade-like presentation is limited to clearly labelled **Simulated Trade Activity** / **SIMULATED RESULTS**.

## Current V1 Sequence

1. WAL-01 Wallet / immutable ledger foundation — local acceptance pending
2. Package subscription / activation from approved payment
3. Referral commissions on legitimate package/payment events
4. Rewards / caps / lifecycle accounting
5. Simulated Trade Activity display only
6. Minimal v1 landing/template controls
7. Remaining USER/ADMIN operational slices
8. Notifications/reports required for launch
9. QA/security/release hardening
10. Production deployment

## Infrastructure / Data Ownership

- MySQL is the relational/business/accounting source of truth.
- MongoDB is reserved for later document/CMS/flexible configuration use only if a repository feature actually requires it.
- Redis is transient infrastructure and should only be introduced when a repository feature requires it.

## Delivery Workflow — CURRENT LOCK

1. Reconcile repo + persistent docs.
2. Lock business semantics and contract.
3. Implement backend/database/API + matching BFF/ADMIN/USER UI as one vertical slice.
4. Complete focused automated regression coverage.
5. Pull completed slice locally.
6. Run code gate + explicit migration status/deploy.
7. Run **frontend/UI acceptance first**.
8. If a UI function fails, inspect/debug only that specific API/Postman flow.
9. Run SQL/audit readback + milestone verification.
10. Update final acceptance docs/state.
11. Open PR only after local gates are GREEN and Founder explicitly approves.

Production deployment remains HOLD until required v1 milestones and local acceptance are complete.
