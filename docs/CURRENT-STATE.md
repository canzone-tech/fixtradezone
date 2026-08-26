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

PKG-01 local API/SQL/UI/milestone acceptance is GREEN. It intentionally contains no purchase, activation, balance, earning, deposit, subscription or ledger mutation.

## Active Development Branch

`feature/deposits-foundation`

Created from the accepted `feature/packages-foundation` head so DEP-01 can be completed as one backend + BFF + ADMIN + USER vertical slice before local acceptance.

## DEP-01 — Deposit Foundation

Status: **NETWORK-AWARE HARDENING IMPLEMENTED ON FEATURE BRANCH / REVERIFICATION + 0009 DEPLOYMENT + COMBINED ACCEPTANCE PENDING**.

Canonical contract: `docs/DEPOSITS-FOUNDATION.md`.

### Local gates already achieved before the network-generalization correction

- complete backend/admin code gate was GREEN;
- migration `0008_deposit_foundation` initially hit MySQL CHECK/FK error 3823;
- the open-key CHECK was corrected before successful application;
- failed partial 0008 state was cleanly rolled back/resolved and redeployed;
- local database confirmed 8 migrations and schema up to date.

`0008` is now immutable applied history.

### Founder architecture correction during UI acceptance

The Admin receiving-account form exposed a hardcoded TRON browser address pattern. Founder correctly rejected this as a global platform rule because future assets/tokens may use other networks.

The foundation has therefore been hardened before DEP-01 acceptance:

- receiving accounts are explicitly asset + network aware;
- current QA still defaults to USDT/TRC20;
- Admin account creation exposes asset/token + supported network;
- no hardcoded `T...` browser pattern exists on the generic address field;
- backend address validation is selected by network;
- asset/network/address are immutable after account creation;
- receiving-account uniqueness is `(asset, network, walletAddress)`;
- package deposits select ACTIVE receiving accounts matching the package currency/asset;
- server randomly assigns the concrete account/network and snapshots it;
- USER cannot override network/address;
- transaction-ID validation is selected by the assigned network;
- transaction uniqueness is `(assignedNetwork, txid)`;
- transaction storage is widened for non-64-character network identifiers.

Supported network registry currently includes:

```text
TRC20
ERC20
BEP20
POLYGON
ARBITRUM
BASE
OPTIMISM
SOLANA
```

Unknown networks remain rejected until a deliberate validator is added.

### New forward migration

`0009_deposit_network_generalization` is implemented in source but **must not be deployed until the revised full code gate is GREEN**.

It:

- removes USDT-only/TRC20-only CHECK constraints from receiving/deposit rows;
- replaces global wallet-address uniqueness with asset/network/address uniqueness;
- adds asset/network/active lookup indexing;
- expands transaction identifier storage;
- replaces global TXID uniqueness with network-scoped uniqueness.

### DEP-01 behavior retained

- one open deposit per USER;
- backend authoritative package amount/currency;
- random server-side account assignment;
- immutable assignment snapshot;
- manual ADMIN/SUPER_ADMIN review;
- terminal `APPROVED` / `REJECTED` facts;
- audited transitions;
- no private key/seed/signing secret storage;
- no automatic blockchain verification;
- no wallet balance, ledger credit, package activation, commission, reward or trading side effect.

### Revised local acceptance sequence

Do not mark DEP-01 accepted until the Founder completes:

1. pull latest `feature/deposits-foundation`;
2. regenerate Prisma client;
3. rerun full backend + admin `verify:local` after network-aware hardening;
4. inspect migration status read-only and confirm 9 migrations with only `0009_deposit_network_generalization` pending;
5. explicitly deploy `0009`;
6. rerun migration status and confirm schema up to date;
7. configure at least one real public ACTIVE USDT/TRC20 receiving account with matching QR for the current QA lane;
8. run DEP-01 Postman combined acceptance;
9. verify `/deposits` and `/user/deposits` together in browser/PWA;
10. verify SQL/audit readback;
11. run `npm run verify:milestone`;
12. confirm clean working tree.

No PR to `main` is opened until this complete gate is GREEN and explicitly approved.

## Product Scope Correction — LOCKED

There is **no AI Agents milestone in FixTradeZone v1**.

FixTradeZone does not execute real trades and will not implement an AI trading engine, broker/exchange execution, strategy execution or automated trading. Older references are superseded.

Future trade-like presentation is limited to explicitly labelled **Simulated Trade Activity** / **SIMULATED RESULTS** and must never be represented as real trading or realized/withdrawable trading profit.

## Current V1 Sequence

1. DEP-01A Deposit Accounts — network-aware hardening acceptance pending
2. DEP-01B Deposits / transaction ID / Approval — combined acceptance pending
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
