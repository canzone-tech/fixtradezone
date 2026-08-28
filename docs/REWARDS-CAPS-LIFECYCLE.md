# RWD-01 — Rewards / Caps / Lifecycle Accounting

Status: **R48–R58 LOCKED / APPROVED 2026-08-27; IMPLEMENTED ON FEATURE BRANCH; LOCAL RUNTIME ACCEPTANCE PENDING**.

The Founder-approved lock is also recorded in
`docs/REWARDS-CAPS-LIFECYCLE-LOCK.md`. This document is the execution contract
for RWD-01 and must not be weakened by UI, scheduler, reconciliation or future
policy changes.

## Purpose

RWD-01 turns immutable ACTIVE package-subscription snapshots into deterministic,
idempotent package-reward events, cap consumption and package lifecycle state.

It consumes the existing PKG-01 package commercial snapshot, SUB-02 immutable
subscription and WAL-01 ledger. It does not create or alter simulated trade
results, referral commissions, team awards or withdrawals.

## Existing locked rules consumed

The engine preserves the canonical decisions already recorded in
`docs/MLM-BUSINESS-RULES.md`:

- Q17 — cap contribution is configurable per earning type.
- Q18 — historical events retain the applicable plan/version.
- Q21 — profit distribution is configurable by plan/package.
- Q22 — reward-rate meaning is configurable.
- Q23 — reward-rate selection mode is configurable and the applied rate is recorded.
- Q24 — reward frequency is configurable.
- Q25 — cycle-end behavior is configurable and cycle duration is separate from package lifetime.
- Q26 — cap basis is configurable (`TOTAL_RETURN` / `PROFIT_ONLY`).
- Q27 — cap-reached action is configurable and independent from cycle end.
- Q28 — principal treatment is configurable.
- Q30 — first reward start time is configurable; timezone/settlement boundary must be explicit.
- Q31 — cycle-day and reward-day counting are independently configurable.

Existing package/subscription snapshots already retain:

```text
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
settlementTimezone
```

RWD-01 consumes those immutable subscription snapshots rather than mutable
current catalogue terms for an existing subscription.

## Locked R48–R58 execution boundary

### R48 — Reward source authority

**LOCKED:** immutable ACTIVE package subscription snapshot only.

Only an ACTIVE immutable package subscription may generate package rewards.
Deposit approval by itself is not a reward source, and mutable current package
catalogue terms never rewrite an existing subscription's reward economics.

### R49 — Initial executable rate modes

**LOCKED:** execute `FIXED` and `RANDOM_RANGE`; fail closed for `MANUAL` and
`RULE_BASED`.

For `RANDOM_RANGE`, the selected rate is exact to six decimals, deterministic for
the immutable event source key, persisted on the event and reused on retries. A
failed transaction creates no settled reward; a committed event is never
re-randomized.

### R50 — Initial executable reward-rate meaning

**LOCKED:** execute `USER_NET_AFTER_SPLIT`; fail closed for
`GROSS_BEFORE_SPLIT` until a recipient/distribution engine exists.

No implicit 70/30 or any other distribution split is invented.

### R51 — Initial executable schedule/day modes

**LOCKED:** execute:

```text
NEXT_CALENDAR_DAY + DAILY_CALENDAR + CALENDAR_DAYS + EVERY_DAY
```

The immutable subscription `settlementTimezone` is authoritative. Other schema
modes remain valid future configuration values but fail closed until their
specific engines are accepted.

### R52 — Settlement timestamp

**LOCKED:** for `NEXT_CALENDAR_DAY`, the first payable reward becomes due at the
next local calendar-day boundary in the subscription settlement timezone after
the applicable schedule anchor. Subsequent `DAILY_CALENDAR` rewards use
consecutive local calendar-day boundaries.

Each event stores both its logical local reward date and actual posted timestamp.

### R53 — Initial cap/principal interpretation

**LOCKED:** execute current seeded `TOTAL_RETURN + INCLUDED_IN_TOTAL_RETURN`
semantics.

For package value `P` and cap multiplier `M`:

```text
capLimit = P * M
initialCapConsumed = P
rewardHeadroomAtActivation = capLimit - P
```

Principal is counted exactly once for cap accounting and is not credited back to
the USER by RWD-01. `RETURN_SEPARATELY` fails closed until a dedicated
principal-return settlement path exists.

### R54 — Initial cap contribution policy

**LOCKED initial versioned policy:**

```text
package_reward      = COUNT
referral_commission = DO_NOT_COUNT
team_commission     = DO_NOT_COUNT
award_reward        = DO_NOT_COUNT
other_income        = DO_NOT_COUNT
```

These contribution flags are immutable policy-version snapshot data. Referral
commission is therefore not silently consumed by a package cap in the initial
RWD-01 engine.

### R55 — Cycle and package-lifetime behavior

For currently seeded terms:

```text
cycleEndAction   = AUTO_START_NEXT_CYCLE
capReachedAction = COMPLETE_PACKAGE
```

**LOCKED:**

- cycles advance automatically while the package remains within `goalDays` and
  below cap;
- `cycleDays` controls cycle boundaries, not package expiry;
- reaching cap clips the final reward to exact remaining headroom and completes
  the subscription;
- reaching package lifetime completes reward generation even when cap headroom
  remains;
- no reward is generated after completion;
- renewal is a separate later action governed by subscription renewal policy.

### R56 — Financial posting model

**LOCKED:** balanced immutable double-entry ledger posting only.

```text
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE / <currency>
CREDIT USER   / PACKAGE_EARNINGS       / <currency>
```

Reward event + cap-state update + balanced ledger transaction commit atomically.
No direct balance mutation or UI-entered reward amount is permitted.

### R57 — Automatic processing and reconciliation

**LOCKED:** one authoritative idempotent `process due rewards` service is used by
both:

- automatic scheduler/worker adapter;
- authorized ADMIN/SUPER_ADMIN reconciliation endpoint.

Reconciliation is recovery/operations tooling, not an alternate calculation
path. Neither path accepts an arbitrary reward amount.

### R58 — Existing-subscription rollout

**LOCKED:** rollout behavior is configurable and versioned. Initial live policy:

```text
FORWARD_ONLY_FROM_POLICY_EFFECTIVE
```

For an existing ACTIVE subscription:

```text
scheduleAnchor = MAX(subscription.activatedAt, rewardPolicy.effectiveFrom)
first payable reward boundary = next local calendar-day boundary after scheduleAnchor
```

No reward is backfilled for logical reward dates before the effective policy.
Natural package lifetime/day/cycle numbering still derives from the original
subscription activation and does not restart at policy rollout.

Example: a subscription activated on Aug 20 with policy effective Aug 28 first
becomes payable at the Aug 29 local-day boundary; Aug 21–28 are not backfilled.

`RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE` may exist as a future policy mode but
fails closed until a controlled retroactive catch-up engine is separately
implemented and accepted.

## Exact decimal settlement invariant

- selected/applied reward rate: exact six-decimal precision;
- calculated and posted money: `DECIMAL(20,8)` precision;
- financial calculation settlement uses deterministic **round down** to eight
  decimals;
- final cap settlement is clipped to exact remaining cap headroom;
- retries use immutable event identity and never produce a second financial
  settlement.

## Reward event identity

A daily reward event uses deterministic identity:

```text
SUBSCRIPTION:<subscriptionId>:PACKAGE_REWARD:<localRewardDate>
```

The unique source key prevents duplicate settlement across retries, scheduler
restarts or operator reconciliation.

## Cap clipping

If the calculated reward exceeds remaining cap headroom:

```text
postedReward = remainingCapHeadroom
```

The event records calculated amount, posted/clipped amount, cap before, cap
after and completion reason. No value above configured cap is posted.

## Historical state

Each immutable reward event retains the economic and lifecycle snapshot needed
to explain the posting, including:

```text
subscriptionId
rewardCapPolicyVersionId
packagePlanVersionId
packagePlanItemId
packageCode/displayName
packageValue/currency
reward logical date
cycle number/day
settlement timezone
selected/applied rate
reward-rate mode/meaning
calculated reward
posted reward
cap basis/multiplier
principal treatment
cap limit
cap consumed before/after
cap contribution policy snapshot
cycle/lifetime policy snapshot
rollout policy snapshot
ledgerTransactionId
completion reason
createdAt/postedAt
```

## RBAC boundary

```text
rewards.read
rewards.reconcile
```

- reward-policy read access is permission-gated;
- reward-policy draft/create/update/publish is `SUPER_ADMIN` only for RWD-01;
- reconciliation requires `rewards.reconcile` or `SUPER_ADMIN`;
- no arbitrary reward amount/balance mutation permission exists.

## UI contract

ADMIN:

```text
/rewards
- versioned reward/cap policy
- due/blocked reconciliation queue
- immutable reward events
- cap/lifecycle state
- worker health
- same-service process-due recovery action
```

USER:

```text
/user/packages
- immutable active package snapshot
- per-subscription reward/cap/lifecycle progress
- settled package reward history

/user/wallet
- Package Earnings ledger bucket and immutable activity
```

Financial/admin timestamps render through the shared platform-time contract;
browser-local timezone is not used to reinterpret settlement history.

No Simulated Trade Activity is presented as the source of real package reward
money.

## Deferred / fail-closed

- `GROSS_BEFORE_SPLIT` recipient distribution;
- `MANUAL` / `RULE_BASED` rate engines;
- selected-weekday/custom-calendar/per-cycle/per-event scheduling;
- separately returned principal;
- `RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE` catch-up engine;
- auto-renewal financial execution;
- team/award reward engines;
- refund/chargeback reversal implementation;
- withdrawals/payouts;
- Simulated Trade Activity display.

## Acceptance workflow

Implementation approval is locked, but production acceptance is not inferred
from source code or CI. Required sequence remains:

1. migration/schema + immutable reward/cap state reviewed;
2. backend service/API + scheduler/reconciliation adapter implemented;
3. ADMIN + USER UI implemented in the same vertical slice;
4. focused automated tests and CI green;
5. local database backup + migration deploy/readback;
6. local code gate;
7. Postman/API + browser/UI runtime acceptance together;
8. ledger/cap/idempotency SQL readback;
9. acceptance evidence/current-state docs update;
10. PR to `main` only after all required gates are green.

Current status: steps 1–4 are source/CI work in progress on the feature branch;
steps 5–9 require local execution and evidence before step 10 is allowed.
