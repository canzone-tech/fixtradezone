# SUB-02 — Package Subscription / Activation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

## Purpose

SUB-02 converts an eligible approved/accounted package payment into an immutable USER package activation and consumes the exact package principal through the immutable ledger.

This milestone consumes PKG-01, DEP-01 and WAL-01. It does not implement referral commissions, reward accrual/caps, renewals/upgrades, withdrawals or simulated-trade accounting.

## Source-of-truth chain

```text
Published package plan/item
→ USER selects package during deposit creation
→ deposit snapshots package/amount/currency/policy
→ payment TXID submitted
→ authorized review APPROVES deposit
→ WAL-01 posts approved-deposit accounting
→ SUB-02 activates package according to the immutable source-plan policy
```

A package may never become ACTIVE before approved-deposit accounting exists.

## Supported activation engines

### PAYMENT_APPROVED — automatic activation

For a deposit whose source plan snapshots `PAYMENT_APPROVED`:

1. authorized review transitions the deposit to APPROVED;
2. approved-deposit accounting posts according to the global accounting policy;
3. once accounting exists, SUB-02 activates the package automatically;
4. the same idempotent activation service is used by orchestration and recovery.

### MANUAL_ACTIVATION — authorized manual activation

For a deposit whose source plan snapshots `MANUAL_ACTIVATION`:

1. authorized review transitions the deposit to APPROVED;
2. approved-deposit accounting posts first;
3. the deposit remains visible in Activation Pending;
4. an actor with `subscriptions.activate` explicitly completes package activation.

This manual action is a controlled reconciliation step, not an alternate purchase path.

### Deferred execution engines

Configuration values such as `PAYMENT_SUBMITTED` and `RULE_BASED` remain part of the package-plan model, but new deposit funding fails closed while their execution engines are not implemented.

The UI may explain these policies, but it must not allow a user to create a package-funding deposit that cannot be fulfilled safely.

## Accounting policy is independent

Global approved-deposit accounting policy is independent from package activation policy.

Supported accounting modes:

- `AUTO_ON_APPROVAL`
- `MANUAL_RECONCILIATION`

Therefore:

- AUTO accounting + PAYMENT_APPROVED → approve, account, activate;
- AUTO accounting + MANUAL_ACTIVATION → approve, account, wait for authorized activation;
- MANUAL accounting → approval completes first, then accounting/recovery occurs, then package activation follows the source-plan trigger.

No activation path may bypass WAL-01 accounting.

## Package principal accounting

Approved-deposit accounting first credits USER Main / Deposit:

```text
DEBIT   SYSTEM:DEPOSIT_CLEARING:<currency>
CREDIT  USER:<userId>:MAIN:<currency>
```

Package activation then consumes the exact package principal:

```text
LedgerTransaction(
  kind = PACKAGE_ACTIVATION_FUNDING,
  sourceKey = DEPOSIT:<depositId>:PACKAGE_ACTIVATION
)

DEBIT   USER:<userId>:MAIN:<currency>          <package amount>
CREDIT  SYSTEM:PACKAGE_PRINCIPAL:<currency>    <package amount>
```

The funding transaction and USER subscription creation commit together or not at all.

## Idempotency

One deposit can activate at most one USER package.

Deterministic source key:

```text
DEPOSIT:<depositId>:PACKAGE_ACTIVATION
```

The USER package record also has a unique source-deposit relationship.

Repeated activation for an already-activated deposit returns the existing subscription and never consumes Main Wallet twice.

Verified local retry response contract:

```json
{
  "created": false,
  "message": "Package was already activated from this deposit.",
  "subscription": {
    "id": "<original-subscription-id>",
    "sourceDepositId": "<same-deposit-id>",
    "status": "ACTIVE"
  }
}
```

## Active-package modes

### SINGLE_ACTIVE

If the immutable source plan uses `SINGLE_ACTIVE`, activation enforces the single-active boundary transactionally.

The schema does not use a permanent global unique constraint because future/effective plans may legitimately permit multiple active packages.

### MULTIPLE_ACTIVE

`MULTIPLE_ACTIVE` is operational.

A USER may retain more than one ACTIVE package subscription simultaneously when the immutable source plan permits it.

Local acceptance proved three simultaneously ACTIVE subscriptions whose immutable snapshots retained different historical policies:

- an older SINGLE_ACTIVE / PAYMENT_APPROVED activation;
- a newer MULTIPLE_ACTIVE / PAYMENT_APPROVED activation;
- a newer MULTIPLE_ACTIVE / MANUAL_ACTIVATION activation.

No effective-plan change rewrites an existing subscription snapshot.

## Immutable activation snapshots

Each USER package stores the source and commercial terms required to reproduce the activation decision without reading a later package plan, including:

```text
userId
sourceDepositId
sourceDepositAccountingTransactionId
fundingLedgerTransactionId
packagePlanVersionId
packagePlanItemId
packageDefinitionId
packageCode
packageDisplayName
price
currency
activePackageMode
multipleActivePackageBasis
activationTrigger
renewalMode
upgradesEnabled
settlementTimezone
rewardRateMode
fixed/min/max reward rate
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
activatedAt
scheduledEndAt
status
```

Money/rate values retain exact SQL DECIMAL semantics and monetary JSON values are strings.

### OPS-01 timezone precedence addendum — 2026-08-28

OPS-01 supersedes the original assumption that a package-plan timezone is copied into every future activation.

For **new activations**, the authoritative settlement-timezone source is the singleton SUPER_ADMIN Platform Operations configuration:

```text
system_operations_config.platformTimezone
        ↓
activation transaction
        ↓
user_package_subscriptions.settlementTimezone
```

The timezone is read inside the same SERIALIZABLE activation transaction before package financial writes. If the Platform Operations timezone is unavailable, activation fails closed before package funding/subscription writes.

The captured timezone is written into the immutable subscription snapshot and activation audit/ledger metadata. Reward/calendar engines consume that subscription snapshot thereafter.

Already-created subscriptions retain their historical `settlementTimezone` exactly as recorded; changing Platform Operations never rewrites them.

`package_plan_versions.settlementTimezone` remains in the schema only for backward compatibility/history. It is non-authoritative for new activations and is no longer an Admin-editable runtime setting. Direct package-plan timezone mutation is rejected; the single supported control is SUPER_ADMIN **Settings → Operations → Platform timezone**.

## RBAC

SUB-02 uses:

```text
subscriptions.read
subscriptions.activate
ledger.post
```

- `subscriptions.read` controls delegated subscription reads.
- `subscriptions.activate` controls manual activation/reconciliation.
- `ledger.post` controls explicit approved-deposit accounting recovery.
- SUPER_ADMIN retains the existing RBAC bypass contract.

No arbitrary balance editor or arbitrary create-active-package endpoint exists.

## API surface

### USER

```text
GET /subscriptions/me
```

Returns current ACTIVE package(s) plus immutable package history.

### ADMIN / SUPER_ADMIN

```text
GET  /admin/subscriptions
GET  /admin/subscriptions/activation-pending
GET  /admin/subscriptions/:subscriptionId
POST /admin/deposits/:depositId/activate-package
POST /admin/deposits/:depositId/post-accounting
```

Accounting configuration:

```text
GET   /admin/settings/accounting
PATCH /admin/settings/accounting
```

Platform Operations timezone/automation configuration (OPS-01):

```text
GET   /admin/settings/operations
PATCH /admin/settings/operations
```

## Frontend acceptance surface

### USER

`/user/packages` and `/user/deposits`:

- display the effective active-package mode;
- display the effective activation trigger;
- explain AUTO vs authorized MANUAL behavior;
- block funding for unsupported execution engines;
- display multiple simultaneous ACTIVE subscriptions independently;
- retain historical policy snapshots on existing subscription records.

### ADMIN

`/packages`:

- activation policy is visible and editable only on DRAFT plans;
- AUTO vs MANUAL behavior is explicitly explained;
- settlement timezone is informational and sourced from Platform Operations rather than exposed as a second editable package-plan knob;
- unsaved lifecycle/item changes are visibly flagged;
- publication is disabled until local draft changes are explicitly saved;
- success/error/unsaved feedback remains viewport-visible on the long workspace.

`/deposits`:

- approval result distinguishes activation completed vs activation pending;
- authorized accounting recovery is available only where applicable.

`/subscriptions`:

- Activation Pending shows immutable source plan mode/trigger;
- MANUAL_ACTIVATION exposes `Activate package`;
- automatic-policy recovery is distinguished from intentional manual activation.

Admin Deposits and Subscriptions also have explicit topbar route headings rather than the generic Dashboard fallback.

## Local acceptance evidence — 2026-08-27

GREEN through combined backend + frontend testing:

- AUTO `PAYMENT_APPROVED` browser flow;
- `MULTIPLE_ACTIVE` simultaneous package behavior;
- USER/Admin immutable policy snapshot display;
- authorized `MANUAL_ACTIVATION` browser flow;
- approval/accounting completing without premature MANUAL activation;
- Activation Pending before manual action;
- pending-queue removal after successful manual action;
- Postman/API effective-policy readback;
- Postman/API three-active-subscription readback;
- manual activation idempotency retry returning `created: false` and the original subscription identity;
- backend tests/build/format/lint;
- Prisma validation and migration status;
- admin lint/typecheck/Next.js production build;
- root milestone verification;
- unstaged and staged diff checks.

OPS-01 timezone-source behavior added on 2026-08-28 requires fresh local activation acceptance before the current combined RWD/OPS feature is eligible for merge; the historical SUB-02 evidence above is not used as proof of that new behavior.

## Explicitly deferred

SUB-02 does not implement:

- referral commission generation;
- team-business volume;
- package reward events;
- cap consumption/completion;
- simulated trade activity as money;
- upgrade execution;
- renewal execution;
- refund/chargeback/cancellation reversals;
- withdrawal/payout;
- arbitrary ADMIN package assignment;
- PAYMENT_SUBMITTED execution engine;
- RULE_BASED execution engine.

Later milestones must consume immutable SUB-02 records and WAL-01 ledger events rather than rewrite package/payment history.

## Delivery state

Historical SUB-02 implementation/local acceptance was completed on `feature/package-subscription-activation`.

The current RWD/OPS feature branch adds the OPS-01 timezone precedence described above and must pass fresh local API/browser acceptance before merge to `main`.
