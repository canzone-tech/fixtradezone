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

## Active Development Branch

`feature/deposits-foundation`

Created from accepted `feature/packages-foundation` head.

## DEP-01 — Deposit Foundation

Status: **PAYMENT-RAIL HARDENING IMPLEMENTED IN SOURCE / LOCAL REVERIFICATION + 0009 DEPLOYMENT + COMBINED ACCEPTANCE PENDING**.

Canonical contract: `docs/DEPOSITS-FOUNDATION.md`.

### Verified history before payment-rail hardening

- backend/admin code gate had reached GREEN;
- migration `0008_deposit_foundation` initially hit MySQL CHECK/FK error 3823;
- failed partial state was cleanly removed and migration marked rolled back;
- corrected `0008` was successfully redeployed;
- local DB confirmed 8 migrations and schema up to date.

`0008` is now immutable applied migration history and must not be edited.

### Founder architecture correction

During Admin UI acceptance, the original TRON-only receiving-address form exposed a platform-hardcoded network assumption. Founder rejected that as non-production-ready because future currencies/tokens may use other networks.

The replacement architecture is **data-driven payment rails**:

```text
DepositPaymentRail
  asset
  networkCode
  displayName
  validationProfile
  active/revision/audit metadata

DepositAccount
  references paymentRailId
  immutable public address
  QR
  active/revision/audit metadata

Deposit
  package/amount/currency snapshot
  assigned account/address/network snapshot
  assigned validation-profile snapshot
  transaction/review lifecycle
```

Network names are no longer a frontend/backend hardcoded list.

Protocol validator families remain reviewed code:

```text
TRON
EVM
SOLANA
```

Unknown validation semantics are never silently accepted.

### Correct network-selection rule

If one package currency is available on multiple payment rails, the **USER chooses the payment network**.

The backend never randomly chooses a blockchain/network. After the rail is selected, the backend randomly assigns one ACTIVE receiving account **inside that exact rail**.

This prevents wrong-chain payment ambiguity while preserving account-pool distribution.

### Payment-rail integrity

- Admin creates/configures payment rails before receiving accounts.
- Account creation accepts `paymentRailId`, not freehand asset/network strings.
- Account address validation uses the selected rail's protocol profile.
- Rail `asset`, `networkCode`, and `validationProfile` are immutable after creation.
- Rail display name and active state are revision-controlled and audited.
- Account address is immutable after creation.
- Account activation is blocked while its rail is inactive.
- Account uniqueness is `(paymentRailId, walletAddress)`.
- Deposit creation requires `packagePlanItemId + paymentRailId`.
- Selected rail must be ACTIVE and match package currency.
- Deposit snapshots `assignedNetwork + assignedValidationProfile`.
- Transaction validation uses the immutable deposit snapshot, not current rail settings.
- Transaction uniqueness is `(assignedNetwork, txid)`.

### Current QA rail

The first acceptance lane remains the seeded configuration:

```text
asset = USDT
networkCode = TRC20
validationProfile = TRON
```

This is launch/QA data, not a platform-wide hardcode.

### Migration `0009_deposit_network_generalization`

Current local read-only status already confirmed:

- 9 migrations are present;
- `0008` is applied;
- only `0009_deposit_network_generalization` is pending.

The pending migration has now been revised to implement the payment-rail model. It:

- creates `deposit_payment_rails`;
- seeds deterministic USDT/TRC20/TRON rail data;
- backfills existing 0008 accounts to that rail;
- adds `paymentRailId` FK to receiving accounts;
- removes old USDT/TRC20-only SQL constraints;
- changes account uniqueness to rail + address;
- expands transaction-ID storage;
- snapshots `assignedValidationProfile` on deposits;
- keeps historical 0008 rows intact.

**Do not deploy 0009 until the revised full code gate is GREEN.**

### DEP-01 behavior retained

- one open deposit per USER;
- package price/currency backend-authoritative;
- exact SQL DECIMAL;
- immutable account/payment snapshots;
- manual ADMIN/SUPER_ADMIN approval/rejection;
- audited terminal facts;
- no private key/seed/signing secret storage;
- no automatic blockchain verification;
- no wallet balance, ledger credit, package activation, commission, reward or trading side effect.

### Revised local acceptance sequence

1. Pull latest `feature/deposits-foundation`.
2. Regenerate Prisma client.
3. Run full backend + admin `verify:local`.
4. Confirm migration status still shows only `0009` pending.
5. Deploy `0009` only after code gate GREEN.
6. Confirm database schema up to date.
7. In Admin `/deposits`, verify seeded USDT/TRC20 rail and create one real public ACTIVE account + matching QR.
8. Run DEP-01 combined Postman acceptance.
9. Verify `/deposits` and `/user/deposits` together in browser/PWA.
10. Verify SQL/audit readback.
11. Run `npm run verify:milestone`.
12. Confirm clean working tree.

No PR to `main` until every gate is GREEN and Founder explicitly approves.

## Product Scope Correction — LOCKED

There is **no AI Agents milestone in FixTradeZone v1**.

FixTradeZone does not execute real trades and will not implement AI/broker/exchange strategy execution. Future trade-like presentation is limited to clearly labelled **Simulated Trade Activity** / **SIMULATED RESULTS**.

## Current V1 Sequence

1. DEP-01 payment rails + receiving accounts + manual deposit review — acceptance pending
2. Wallet / Ledger foundation + controlled accounting credit
3. Package subscription / activation from approved payment
4. Referral commissions on legitimate package/payment events
5. Rewards / caps / lifecycle accounting
6. Simulated Trade Activity display only
7. Minimal v1 landing/template controls
8. Remaining USER/ADMIN operational slices
9. Notifications/reports required for launch
10. QA/security/release hardening
11. Production deployment

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
7. Run Postman/API + frontend/PWA integrated acceptance together.
8. Run SQL/audit readback + milestone verification.
9. Update final acceptance docs/state.
10. Open PR only after local gates are GREEN and Founder approves.

Production deployment remains HOLD until required v1 milestones and local acceptance are complete.
