# SUB-01 — Package Subscription / Activation

Status: **CONTRACT LOCKED / IMPLEMENTATION IN PROGRESS**.

## Purpose

SUB-01 converts an eligible, approved and accounted package payment into one immutable USER package activation and moves the exact package principal out of the freely available Main / Deposit wallet into package-principal accounting.

This milestone consumes the existing PKG-01, DEP-01 and WAL-01 foundations. It does **not** calculate referral commission, package rewards, caps, simulated activity, withdrawals or renewals/upgrades.

## Source-of-truth chain

```text
Published package plan/item
→ USER selects package during DEP-01 deposit creation
→ deposit snapshots package/amount/currency
→ payment TXID submitted
→ authorized review APPROVES deposit
→ WAL-01 posts DEPOSIT:<depositId>:CREDIT
→ SUB-01 activates package exactly once
```

The configured initial activation trigger remains `PAYMENT_APPROVED`, but financial activation also requires the approved deposit to have been posted into WAL-01 accounting. This settlement prerequisite prevents an ACTIVE package and a freely spendable duplicate Main Wallet principal from co-existing.

If deposit accounting is temporarily in `MANUAL_RECONCILIATION`, package activation waits in Activation Pending until the deposit credit exists.

## Initial locked package rules consumed by SUB-01

- activation trigger: `PAYMENT_APPROVED`;
- active-package mode: `SINGLE_ACTIVE`;
- multiple-active basis if later enabled: `HIGHEST_ACTIVE_PACKAGE`;
- upgrades: disabled in the current published plan;
- renewal: `MANUAL_AFTER_TERMINAL`;
- principal treatment: `INCLUDED_IN_TOTAL_RETURN`;
- cap basis: `TOTAL_RETURN`;
- plan migration mode: `NEW_PACKAGE_ACTIVATIONS`;
- currency: package-item/deposit snapshot, currently USDT.

Historical package terms are never re-read from a later plan after activation. SUB-01 snapshots the applicable commercial terms into the USER package record.

## Package principal accounting

An approved deposit is first credited by WAL-01:

```text
DEBIT   SYSTEM:DEPOSIT_CLEARING:<currency>
CREDIT  USER:<userId>:MAIN:<currency>
```

Package activation then consumes the same package principal:

```text
LedgerTransaction(
  kind = PACKAGE_ACTIVATION_FUNDING,
  sourceKey = DEPOSIT:<depositId>:PACKAGE_ACTIVATION
)

DEBIT   USER:<userId>:MAIN:<currency>          <package amount>
CREDIT  SYSTEM:PACKAGE_PRINCIPAL:<currency>    <package amount>
```

This means the package amount is no longer shown as freely available Main Wallet balance after activation. The ACTIVE package itself carries the immutable principal snapshot.

The activation funding transaction and USER package creation commit together or not at all.

## Idempotency

One deposit can activate at most one USER package.

Deterministic source key:

```text
DEPOSIT:<depositId>:PACKAGE_ACTIVATION
```

The USER package record also has a unique source-deposit relationship. Repeated orchestration or manual reconciliation returns the existing activation and never consumes Main Wallet twice.

## USER package lifecycle

SUB-01 introduces lifecycle states required for the current and already-locked future package rules:

```text
ACTIVE
COMPLETED
SUPERSEDED
CANCELLED
```

SUB-01 creates only `ACTIVE` records. Later milestones own completion, upgrade supersession, cancellation/reversal and renewal events.

A record is never edited to represent a different package purchase. Renewals/upgrades create linked new records under their own future event contracts.

## SINGLE_ACTIVE enforcement

The current published plan uses `SINGLE_ACTIVE`.

Activation runs under a serializable transaction and locks the USER activation boundary before checking active packages. If one ACTIVE package already exists, another ordinary package activation is rejected/pended rather than silently replacing history.

The schema does not hard-code SINGLE_ACTIVE as a permanent global unique constraint because a future published plan may legitimately enable `MULTIPLE_ACTIVE`. The service enforces the applicable plan snapshot transactionally.

## Activation snapshots

The USER package stores immutable source and commercial snapshots including at minimum:

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

All money/rates use exact SQL DECIMAL semantics. JSON APIs return monetary values as strings.

## Automatic orchestration

For a new deposit approved under the current `PAYMENT_APPROVED` plan:

1. DEP-01 review transitions the deposit to APPROVED.
2. WAL-01 approval orchestration attempts deposit accounting according to its policy.
3. If the deposit credit exists, SUB-01 attempts package activation using the same idempotent activation service.
4. If accounting or activation cannot complete, the approved payment remains recoverable through explicit queues; no financial event is silently lost.

Automatic orchestration never bypasses the subscription service or creates a second accounting path.

## Reconciliation

ADMIN/SUPER_ADMIN accounting/package operations expose approved deposits that are:

- accounting-posted;
- package-linked;
- not yet activated;
- eligible under the package snapshot;
- not blocked by SINGLE_ACTIVE.

Authorized reconciliation calls the same idempotent activation service used by automatic orchestration.

Historical approved/accounted deposits are not auto-mutated by migration. They become visible in Activation Pending for controlled local/operational reconciliation.

## RBAC

SUB-01 introduces:

```text
subscriptions.read
subscriptions.activate
```

`subscriptions.read` allows delegated ADMIN read access when explicitly assigned.
`subscriptions.activate` controls manual activation reconciliation.
SUPER_ADMIN retains the existing permission bypass.

No arbitrary edit-balance or arbitrary create-active-package endpoint exists.

## API surface

### USER

```text
GET /subscriptions/me
```

Returns current ACTIVE package(s) plus immutable package history.

### ADMIN

```text
GET  /admin/subscriptions
GET  /admin/subscriptions/activation-pending
GET  /admin/subscriptions/:subscriptionId
POST /admin/deposits/:depositId/activate-package
```

The activation POST is recovery/reconciliation, not an alternate package-purchase path.

## Frontend acceptance surface

### USER `/user/packages`

The existing package catalogue remains. SUB-01 adds:

- My Active Package;
- principal amount/currency;
- activation date;
- scheduled package end date;
- package status;
- immutable source/payment reference;
- package history;
- no reward/profit values invented before the reward milestone.

After activation, Main Wallet decreases by the exact package principal while Package Earnings / Referral Commission / Rewards remain unchanged.

### ADMIN `/subscriptions`

- Activation Pending queue;
- USER package/subscription list;
- source deposit/payment reference;
- current status;
- package snapshot summary;
- manual Reconcile activation action where authorized;
- shared right-side `FlashMessage` feedback.

## Explicitly deferred

SUB-01 does not implement:

- referral commission generation;
- team-business volume;
- package reward events;
- cap consumption/completion;
- simulated trade activity as money;
- upgrade execution;
- renewal execution;
- refund/chargeback/cancellation reversals;
- withdrawal/payout;
- arbitrary ADMIN package assignment.

Those later milestones must consume immutable SUB-01 records and WAL-01 ledger events rather than rewrite package/payment history.

## Acceptance order

1. backend + frontend implementation complete;
2. backend/admin CI green;
3. forward migration status/deploy green;
4. frontend-first acceptance;
5. API/Postman only for a failing UI/business path;
6. SQL/audit/ledger/subscription readback;
7. final milestone verification;
8. Founder acceptance;
9. PR only after explicit Founder approval.
