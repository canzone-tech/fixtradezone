# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-28

Repository state plus completed local verification are the acceptance authority.
Source code and CI alone are never treated as financial runtime acceptance.

## Active Development Branch

`feature/rewards-caps-lifecycle-foundation`

## Mainline Baseline

`main` contains the cumulative locally accepted business foundation through
COMM-01. PR #17 merged COMM-01 at:

```text
52020a6f8d8c6e7cc67e7fc4909ee53fb73f160a
```

Accepted mainline slices include:

- PKG-01 package-plan foundation;
- DEP-01 deposits/payment rails;
- WAL-01 immutable wallet/ledger foundation;
- SUB-02 package subscription/activation;
- COMM-01 referral commission foundation.

Applied migration history must never be rewritten. MySQL remains the relational,
business and accounting source of truth.

## COMM-01 — Referral Commission Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / MERGED TO MAIN**.

Canonical contract:

`docs/REFERRAL-COMMISSION-FOUNDATION.md`

COMM-01 converts immutable ACTIVE package-subscription events into versioned,
immutable and ledger-backed referral commission outcomes.

The initial executable publication boundary is intentionally limited to:

```text
inactive upline = LOST
compression     = SKIP
release mode    = IMMEDIATE
```

AVAILABLE immediate commission posts through the immutable balanced ledger:

```text
DEBIT  SYSTEM / REFERRAL_COMMISSION_EXPENSE
CREDIT USER   / REFERRAL_COMMISSION
```

Local acceptance on 2026-08-27 verified migration 0013, published V1 reference
levels, package matching, exact 1.00000000 USDT L1 settlement for the accepted
QA flow, wallet readback, immutable events, RBAC and browser/API behavior.

## RWD-01 — Rewards / Caps / Lifecycle Accounting

Status: **R48–R58 LOCKED / FEATURE IMPLEMENTED / SOURCE CI GREEN / LOCAL RUNTIME ACCEPTANCE PENDING**.

Canonical contracts:

- `docs/REWARDS-CAPS-LIFECYCLE.md`
- `docs/REWARDS-CAPS-LIFECYCLE-LOCK.md`

### Founder-approved execution boundary

RWD-01 consumes only an immutable ACTIVE package subscription snapshot. Deposit
approval alone is never a package-reward source.

Initial executable package terms are:

```text
rate modes       = FIXED | RANDOM_RANGE
rate meaning     = USER_NET_AFTER_SPLIT
reward start     = NEXT_CALENDAR_DAY
frequency        = DAILY_CALENDAR
cycle day mode   = CALENDAR_DAYS
reward day mode  = EVERY_DAY
cap basis        = TOTAL_RETURN
principal        = INCLUDED_IN_TOTAL_RETURN
cycle end        = AUTO_START_NEXT_CYCLE
cap action       = COMPLETE_PACKAGE
```

Unsupported configured modes fail closed rather than being silently interpreted.

### Existing-subscription rollout

Initial versioned rollout policy is:

```text
FORWARD_ONLY_FROM_POLICY_EFFECTIVE
```

For an already-ACTIVE subscription:

```text
scheduleAnchor = MAX(subscription.activatedAt, rewardPolicy.effectiveFrom)
first payable boundary = next local calendar-day boundary after scheduleAnchor
```

No pre-policy reward backfill is generated. Natural package day/cycle/lifetime
numbering still derives from the original activation timestamp.

### Cap contribution policy

Initial policy snapshot:

```text
package_reward      = COUNT
referral_commission = DO_NOT_COUNT
team_commission     = DO_NOT_COUNT
award_reward        = DO_NOT_COUNT
other_income        = DO_NOT_COUNT
```

For package value `P` and multiplier `M` under the initial principal semantics:

```text
capLimit          = P * M
initialCapConsumed = P
rewardHeadroom     = capLimit - P
```

Final reward settlement clips exactly to remaining cap headroom.

### Financial settlement

Package reward money is immutable balanced ledger money:

```text
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE
CREDIT USER   / PACKAGE_EARNINGS
```

Reward event, cap/lifecycle state and ledger posting commit atomically.

Selected reward rates retain six-decimal precision. Calculated/posted money is
`DECIMAL(20,8)` and uses deterministic round-down settlement.

Daily source identity is deterministic:

```text
SUBSCRIPTION:<subscriptionId>:PACKAGE_REWARD:<localRewardDate>
```

### Authoritative processing path

One idempotent reward-processing service is shared by:

- the Redis-locked automatic worker;
- authorized ADMIN/SUPER_ADMIN reconciliation/process-due APIs.

The reconciliation path never accepts an arbitrary reward amount and is not an
alternate calculation engine.

### RWD-01 database source state

Migration `0014_rewards_caps_lifecycle_foundation` is present on the feature
branch and has **not yet been deployed in the current local acceptance round**.

It adds:

- `reward_cap_policy_versions`;
- `package_reward_states`;
- `package_reward_events`;
- ledger bucket `PACKAGE_REWARD_EXPENSE`;
- ledger kind `PACKAGE_REWARD_CREDIT`;
- `rewards.read` and `rewards.reconcile`.

V1 is seeded as `DRAFT`, so the migration alone has zero reward financial effect.
Explicit SUPER_ADMIN publication is required.

Migration compatibility review against applied WAL/SUB/COMM schema confirms:

- all prior ledger bucket enum members are preserved;
- all prior ledger transaction-kind enum members are preserved;
- SUB status values match RWD service assumptions;
- immutable subscription reward/cap/schedule snapshots contain the required RWD inputs;
- ledger `sourceType` is a `VARCHAR(40)`, so `PACKAGE_SUBSCRIPTION` is valid.

### RWD-01 automated/source gates

Backend reward calculation/service money-path coverage includes deterministic
random selection, eight-decimal round-down, forward-only scheduling, cap
principal consumption, exact cap clipping, lifecycle completion, fail-closed
policy behavior and idempotent settlement guards.

Latest backend-changing RWD gate is GREEN: formatting/lint, unit tests, Nest
build and dependency audit completed successfully.

Latest ADMIN UI-changing head `80b6cc133b1ab857861433389b8cad8150416e7d`
passed Admin CI run #103.

### UI state

ADMIN `/rewards` provides:

- versioned reward/cap policy state;
- due/blocked reconciliation;
- immutable package reward events;
- cap/lifecycle state;
- worker health;
- authorized same-service process-due recovery action.

USER `/user/packages` provides:

- immutable active package snapshot;
- cap/lifecycle progress;
- next reward/day/cycle state;
- settled immutable package reward history.

USER `/user/wallet` exposes the ledger-backed `PACKAGE_EARNINGS` bucket.

Financial/admin timestamp surfaces for Rewards, Packages/Subscriptions,
Deposits, Wallets, Commissions and Referrals use the shared platform-time
formatter instead of browser-local timezone reinterpretation.

## RWD-01 Remaining Acceptance Gate

Before any PR to `main`:

1. synchronize the feature branch locally and confirm clean state;
2. take a verified local MySQL backup;
3. run Prisma generate/validate and repository code gate;
4. deploy migration `0014` explicitly with `migrate deploy`;
5. verify migration/table/enum/permission readback;
6. start MySQL, Redis, backend and admin locally;
7. run consolidated Postman/API + browser/UI acceptance;
8. prove forward-only no-backfill behavior;
9. prove authoritative process-due/reconciliation behavior and RBAC negatives;
10. prove package reward ledger debit equals credit, Package Earnings credit,
    cap-state transition and immutable event/source-key identity;
11. rerun the same process to prove no duplicate financial settlement;
12. record local evidence and only then open the PR.

No production-only test backdoor or HTTP `asOf` override will be added merely to
force a due reward in QA.

## Current ADMIN UI

Operational routes include:

- Dashboard
- Users
- Roles & Permissions
- Packages
- Deposits
- Wallets & Ledger
- Subscriptions
- Referral Commissions
- Rewards & Caps
- Referrals
- Settings

## Current USER UI

Operational USER financial/referral surfaces include:

- Packages / subscriptions / reward progress
- Deposits
- Wallet
- Referrals / referral commission history

Only ledger-backed settled values are presented as earned wallet money.

## Product Scope — LOCKED

FixTradeZone does not execute real trades and has no AI-agent/broker/exchange
execution milestone in v1.

Future trade-like presentation is limited to clearly labelled **Simulated Trade
Activity** / **SIMULATED RESULTS** and must not silently mutate real wallet/ledger
balances.

## Current V1 Sequence

1. RWD-01 rewards / caps / lifecycle accounting — local acceptance pending
2. Simulated Trade Activity display only
3. minimal v1 landing/template controls
4. remaining USER/ADMIN operational slices
5. notifications/reports required for launch
6. QA/security/release hardening
7. production deployment

## Infrastructure / Data Ownership

- MySQL is the relational/business/accounting source of truth.
- MongoDB remains reserved for later document/CMS/flexible configuration only if
  an implemented repository feature requires it.
- Redis is transient infrastructure; RWD-01 uses it only for the distributed due
  reward worker lock and never as financial source of truth.

## Delivery Workflow — CURRENT LOCK

1. Reconcile repository + persistent docs.
2. Lock business semantics and contract.
3. Implement backend/database/API + matching BFF/ADMIN/USER UI as one vertical slice.
4. Complete focused automated regression coverage.
5. Run the combined backend + frontend code gate locally.
6. Apply explicit reviewed migrations only when required.
7. Run browser/UI + Postman/API verification together in one consolidated local acceptance round.
8. Fix failures at the actual backend/frontend boundary without bypassing checks.
9. Run SQL/audit/ledger readback where financial or persistence evidence is required.
10. Run final milestone verification.
11. Update persistent docs/current state and review the complete diff.
12. Open PR to `main` only after every local gate is GREEN.

Production deployment remains HOLD until required v1 milestones and release
hardening are complete.
