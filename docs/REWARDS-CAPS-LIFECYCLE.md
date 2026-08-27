# RWD-01 — Rewards / Caps / Lifecycle Accounting

Status: **PROPOSED EXECUTION CONTRACT / FOUNDER LOCK REQUIRED BEFORE FINANCIAL IMPLEMENTATION**.

## Purpose

RWD-01 turns immutable ACTIVE package-subscription snapshots into deterministic,
idempotent package-reward events, cap consumption and package lifecycle state.

It consumes the existing PKG-01 package commercial snapshot, SUB-02 immutable
subscription and WAL-01 ledger. It does not create or alter simulated trade
results, referral commissions, team awards or withdrawals.

## Existing locked rules consumed

The engine must preserve the canonical decisions already recorded in
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

RWD-01 must consume those immutable subscription snapshots rather than reading
mutable current catalogue terms for an existing subscription.

## Proposed R48–R57 safe execution boundary

These questions are proposed for Founder approval before money-moving code is
considered locked.

### R48 — Reward source authority

Options:

- A. immutable ACTIVE package subscription snapshot;
- B. current package catalogue row;
- C. approved deposit directly.

**PROPOSED: A.**

Only an ACTIVE immutable package subscription may generate package rewards.
Deposit approval by itself is not a reward source.

### R49 — Initial executable rate modes

Options:

- A. execute `FIXED` and `RANDOM_RANGE`; fail closed for `MANUAL` and `RULE_BASED`;
- B. execute all configured modes immediately;
- C. execute only FIXED.

**PROPOSED: A.**

For `RANDOM_RANGE`, the selected rate is exact to six decimals, persisted on the
immutable reward event and reused on retries. A failed transaction creates no
settled reward; a committed event is never re-randomized.

### R50 — Initial executable reward-rate meaning

Options:

- A. execute `USER_NET_AFTER_SPLIT`; fail closed for `GROSS_BEFORE_SPLIT` until a
  recipient/distribution engine exists;
- B. treat both meanings identically;
- C. hard-code a distribution split.

**PROPOSED: A.**

No implicit 70/30 or other split is invented.

### R51 — Initial executable schedule/day modes

Options:

- A. execute the currently seeded combination:
  `NEXT_CALENDAR_DAY + DAILY_CALENDAR + CALENDAR_DAYS + EVERY_DAY`;
- B. execute every configured scheduling/calendar mode immediately;
- C. manual reward posting only.

**PROPOSED: A.**

The subscription settlement timezone is authoritative. Other configured modes
remain valid schema values but fail closed until their dedicated calendar engine
exists.

### R52 — Settlement timestamp

**PROPOSED:** for the initial `NEXT_CALENDAR_DAY` engine, the first reward becomes
due at the next local calendar day boundary in the subscription
`settlementTimezone`; subsequent DAILY rewards use consecutive local calendar
day boundaries. Each event stores both its logical reward date and actual posted
time.

### R53 — Initial cap/principal interpretation

Options:

- A. execute current seeded `TOTAL_RETURN + INCLUDED_IN_TOTAL_RETURN` semantics;
- B. treat principal as outside the cap;
- C. return principal separately without a dedicated principal-return engine.

**PROPOSED: A.**

For an initial package value `P` and cap multiplier `M`:

```text
capLimit = P * M
initialCapConsumed = P
rewardHeadroomAtActivation = capLimit - P
```

The principal is counted exactly once for cap accounting; it is not credited
back to the USER by RWD-01.

`RETURN_SEPARATELY` requires a dedicated principal-return settlement path and
must fail closed until implemented. Other cap/principal combinations may be
added without rewriting historical subscriptions.

### R54 — Initial cap contribution policy

Q17 requires per-earning-type configurability. Proposed initial versioned policy:

```text
package_reward      = COUNT
referral_commission = DO_NOT_COUNT
team_commission     = DO_NOT_COUNT
award_reward        = DO_NOT_COUNT
other_income        = DO_NOT_COUNT
```

**PROPOSED:** persist these contribution flags as immutable policy snapshot data
for reward/cap processing rather than infer them later from today’s settings.

Referral commission is therefore not silently consumed by a package cap in the
first RWD-01 engine.

### R55 — Cycle and package-lifetime behavior

For the currently seeded terms:

```text
cycleEndAction   = AUTO_START_NEXT_CYCLE
capReachedAction = COMPLETE_PACKAGE
```

**PROPOSED:**

- cycles advance automatically while the package remains within `goalDays` and
  below its cap;
- `cycleDays` controls cycle boundaries, not package expiry;
- reaching the cap clips the final reward to exact remaining headroom and then
  completes the subscription;
- reaching package lifetime (`goalDays`) completes reward generation even if cap
  remains;
- no reward is generated after completion;
- renewal remains a separate later action governed by the subscription renewal
  policy.

### R56 — Financial posting model

Options:

- A. balanced immutable ledger posting;
- B. direct balance mutation;
- C. read-time-only calculation.

**PROPOSED: A.**

```text
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE / <currency>
CREDIT USER   / PACKAGE_EARNINGS       / <currency>
```

Reward event + cap-state update + ledger transaction commit atomically.

### R57 — Automatic processing and reconciliation

**PROPOSED:** one authoritative idempotent `process due rewards` service is used
by both:

- an automatic scheduler/worker adapter;
- an authorized ADMIN/SUPER_ADMIN reconciliation endpoint.

The reconciliation endpoint is recovery/operations tooling, not an alternate
calculation path.

## Reward event identity

A daily reward event must have deterministic identity, for example:

```text
SUBSCRIPTION:<subscriptionId>:PACKAGE_REWARD:<localRewardDate>
```

A unique source key prevents duplicate settlement across retries, scheduler
restarts or operator reconciliation.

## Cap clipping

If the calculated reward exceeds remaining cap headroom:

```text
postedReward = remainingCapHeadroom
```

The event records the originally calculated amount, clipped amount, cap before,
cap after and completion reason. No value above the configured cap is posted.

## Historical state

Each reward event must retain at minimum:

```text
subscriptionId
packagePlanVersionId
packagePlanItemId
packageCode/displayName
packageValue/currency
reward logical date
cycle number/day
selected/applied rate
reward-rate mode/meaning
calculated reward
posted reward
cap basis/multiplier
principal treatment
cap limit
cap consumed before/after
cycle/lifetime policy snapshot
ledgerTransactionId
status/completion reason
createdAt/postedAt
```

## RBAC proposal

```text
rewards.read
rewards.reconcile
```

Package commercial terms remain governed by existing package-plan permissions.
No arbitrary reward amount/balance mutation permission is introduced.

## UI proposal

ADMIN:

```text
/rewards
- due/reconciliation queue
- immutable reward events
- cap/lifecycle state
- scheduler/reconciliation health
```

USER:

```text
/user/packages
- per-subscription reward/cap/lifecycle progress

/user/wallet
- Package Earnings ledger bucket
```

No simulated-trade activity is presented as the source of real package reward
money.

## Deferred

- `GROSS_BEFORE_SPLIT` recipient distribution;
- `MANUAL` / `RULE_BASED` rate engines;
- selected-weekday/custom-calendar/per-cycle/per-event scheduling;
- separately returned principal;
- auto-renewal financial execution;
- team/award reward engines;
- refund/chargeback reversal implementation;
- withdrawals/payouts;
- Simulated Trade Activity display.

## Acceptance workflow

After Founder lock:

1. migration/schema + immutable reward/cap state;
2. backend service/API + scheduler/reconciliation adapter;
3. ADMIN + USER UI in the same vertical slice;
4. focused automated tests;
5. local backup + migration deploy/readback;
6. root combined code gate;
7. browser + Postman runtime acceptance together;
8. ledger/cap/idempotency SQL readback;
9. docs/current-state update;
10. PR to `main` only after all required gates are green.
