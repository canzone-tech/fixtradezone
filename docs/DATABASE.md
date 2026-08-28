# FixTradeZone — Database Standards & Current State

## Single Application Database

- Host: `127.0.0.1`
- Port: `3306`
- Database: `fixtradezone`
- MySQL: 8.x local relational source of truth
- Runtime user: `fixtradezone`

Do not create additional application databases unless explicitly approved.

## Prisma

- Prisma: 7.9.1
- Generator: `prisma-client`
- Output: `src/generated/prisma`
- moduleFormat: `cjs`
- Datasource provider: MySQL
- URL configured through `prisma.config.ts`
- Runtime connectivity uses `@prisma/adapter-mariadb`

## Database Conventions

- UUID IDs: `CHAR(36)`
- persisted timestamps are UTC instants; financial UI display uses the shared platform-time contract
- `createdAt` + `updatedAt` where mutable state exists
- financial values use SQL `DECIMAL`; never FLOAT/DOUBLE
- money settlement precision: `DECIMAL(20,8)` unless a stricter domain field is documented
- percentage/rate snapshot precision: generally `DECIMAL(9,6)`
- explicit lifecycle enums where integrity matters
- secrets stay in env/secret management, never business tables
- important admin/financial actions are audited
- immutable historical financial/business facts are never silently rewritten/deleted
- later reversals/adjustments must be separate linked accounting events
- migration application is explicit; `prisma migrate dev` is prohibited without shadow-DB approval

## Migration Chain

Repository migration order is authoritative:

```text
0001_foundation_auth_rbac
0002_auth_sessions
0003_user_impersonation
0004_security_configuration
0005_configurable_auth_registration
0006_referral_foundation
0007_package_plan_foundation
0008_deposit_foundation
0009_deposit_network_generalization
0010_wallet_ledger_foundation
0011_accounting_posting_policy
0012_package_subscription_activation
0013_referral_commission_foundation
0014_rewards_caps_lifecycle_foundation
```

Applied migrations must never be rewritten. New corrections are forward-only
migrations.

## Business / Accounting Foundations Through 0013

### 0007 — package plan

Introduces stable package definitions, versioned DRAFT/PUBLISHED package plans and
immutable exact-decimal package commercial terms.

### 0008–0009 — deposits and payment rails

Introduce versioned/data-driven receiving rails, public receiving accounts,
immutable deposit assignment snapshots, transaction-ID validation and manual
review state.

No private key, signing key, seed phrase or custody secret is persisted.

### 0010 — immutable wallet / ledger

Introduces:

```text
ledger_accounts
ledger_account_balances
ledger_transactions
ledger_entries
```

Ledger entries are the accounting source of truth. Balance rows are transactional
read models.

The base ledger transaction has:

```text
sourceKey  VARCHAR(191) UNIQUE
sourceType VARCHAR(40)
sourceId   VARCHAR(100)
currency   VARCHAR(10)
```

`sourceType` is intentionally not an enum so reviewed business modules can use
stable source families such as `PACKAGE_SUBSCRIPTION` without rewriting the WAL
foundation.

### 0012 — package subscription activation

Introduces immutable `user_package_subscriptions` with the package/economic
snapshot required by later commission and reward engines.

Status values are exactly:

```text
ACTIVE
COMPLETED
SUPERSEDED
CANCELLED
```

Reward/cap/lifecycle snapshot inputs include:

```text
settlementTimezone
rewardRateMode
fixedRewardRate
minimumRewardRate
maximumRewardRate
rewardRateMeaning
capBasis
capMultiplier
principalTreatment
goalDays
cycleDays
rewardStartMode
rewardFrequency
cycleDayMode
rewardDayMode
cycleEndAction
capReachedAction
```

### 0013 — referral commission foundation

Introduces versioned commission policy, immutable processing runs/events and
balanced Referral Commission ledger posting.

Ledger enum state after 0013 includes:

```text
account buckets:
MAIN
PACKAGE_EARNINGS
REFERRAL_COMMISSION
REWARDS
DEPOSIT_CLEARING
PACKAGE_PRINCIPAL
REFERRAL_COMMISSION_EXPENSE

transaction kinds:
DEPOSIT_CREDIT
PACKAGE_ACTIVATION_FUNDING
REFERRAL_COMMISSION_CREDIT
```

COMM-01 migration and runtime behavior were locally accepted before merge to
`main`.

## 0014 — Rewards / Caps / Lifecycle Foundation

Status: **SOURCE REVIEWED ON FEATURE BRANCH / LOCAL DEPLOYMENT AND RUNTIME ACCEPTANCE PENDING**.

Path:

`backend/prisma/migrations/0014_rewards_caps_lifecycle_foundation/migration.sql`

The migration is forward-only and preserves all enum members created by WAL,
SUB and COMM foundations.

### Ledger extensions

`ledger_accounts.bucket` adds:

```text
PACKAGE_REWARD_EXPENSE
```

while preserving:

```text
MAIN
PACKAGE_EARNINGS
REFERRAL_COMMISSION
REWARDS
DEPOSIT_CLEARING
PACKAGE_PRINCIPAL
REFERRAL_COMMISSION_EXPENSE
```

`ledger_transactions.kind` adds:

```text
PACKAGE_REWARD_CREDIT
```

while preserving:

```text
DEPOSIT_CREDIT
PACKAGE_ACTIVATION_FUNDING
REFERRAL_COMMISSION_CREDIT
```

RWD-01 balanced posting contract is:

```text
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE / <currency>
CREDIT USER   / PACKAGE_EARNINGS       / <currency>
```

### `reward_cap_policy_versions`

Versioned DRAFT/PUBLISHED reward/cap policy with:

- optimistic `revision`;
- effective range and publication integrity checks;
- existing-subscription rollout mode;
- package/referral/team/award/other-income cap contribution flags;
- clone provenance;
- create/update/publish actor FKs.

Initial seeded V1:

```text
status                               = DRAFT
existingSubscriptionRolloutMode      = FORWARD_ONLY_FROM_POLICY_EFFECTIVE
packageRewardCountsTowardCap         = TRUE
referralCommissionCountsTowardCap    = FALSE
teamCommissionCountsTowardCap        = FALSE
awardRewardCountsTowardCap           = FALSE
otherIncomeCountsTowardCap            = FALSE
```

A DRAFT has zero reward financial effect. SUPER_ADMIN publication is required.

### `package_reward_states`

One current lifecycle state per immutable subscription, keyed by
`subscriptionId`.

It snapshots:

- user/policy/currency/package value;
- cap basis/multiplier/principal treatment;
- cap limit and consumed amount;
- all cap contribution flags;
- next logical reward date and due timestamp;
- natural package day/cycle coordinates;
- settled count;
- ACTIVE/COMPLETED/BLOCKED status;
- completion/blocked reason and revision.

Integrity prevents negative cap consumption or consumption above cap.

### `package_reward_events`

Immutable daily package-reward fact with unique:

```text
sourceKey
(subscriptionId, rewardLocalDate)
ledgerTransactionId
```

The event retains the package, reward schedule, selected rate, calculation,
cap-before/cap-after, rollout policy, cap contribution policy and lifecycle
snapshot necessary to explain the ledger posting historically.

Core money fields:

```text
selectedRate      DECIMAL(9,6)
calculatedReward  DECIMAL(20,8)
postedReward      DECIMAL(20,8)
capLimit           DECIMAL(20,8)
capConsumedBefore  DECIMAL(20,8)
capConsumedAfter   DECIMAL(20,8)
```

Checks require positive reward values and prevent `postedReward` from exceeding
the calculated amount or cap state from exceeding the cap limit.

### RWD-01 permissions

0014 seeds:

```text
rewards.read
rewards.reconcile
```

No arbitrary reward/balance mutation permission is introduced.

## 0014 Compatibility Audit — 2026-08-28

Source review against exact 0010/0012/0013 migrations confirms:

- 0014 preserves every previously valid ledger account bucket;
- 0014 preserves every previously valid ledger transaction kind;
- RWD subscription status assumptions exactly match the 0012 enum;
- all required reward/cap/schedule source fields exist in immutable subscription rows;
- RWD FK IDs use the existing `CHAR(36)` convention;
- ledger transaction `sourceType` remains compatible with `PACKAGE_SUBSCRIPTION`;
- V1 policy remains DRAFT after migration and therefore cannot post money by migration alone.

This is source compatibility evidence only. MySQL execution/readback is still
required before local acceptance.

## Local Migration Rule

1. Run repository code gate.
2. Run read-only migration status.
3. Inspect the exact pending migration.
4. Take/verify a local database backup.
5. Apply only with explicit `prisma migrate deploy` / repository deploy script.
6. Rerun migration status.
7. Verify tables, columns, enums, checks, seed policy and permissions by SQL readback.
8. Run module Postman/browser acceptance plus ledger/audit verification.
9. Never rewrite an already-applied migration.
10. Never reset the application database merely to bypass a failed migration.

Current RWD checkpoint: migration `0014` exists on the feature branch and must be
treated as **pending until the operator's local `migrate status/deploy/readback`
evidence confirms otherwise**.

Production migration status remains unknown and production deployment remains
HOLD.
