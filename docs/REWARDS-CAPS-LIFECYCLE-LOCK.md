# RWD-01 — Founder Lock Addendum

Status: **R48–R58 LOCKED / APPROVED 2026-08-27**.

This addendum records Founder approval of the RWD-01 execution boundary in `docs/REWARDS-CAPS-LIFECYCLE.md`.

**Precedence:** this lock addendum supersedes any earlier `PROPOSED` / `FOUNDER LOCK REQUIRED` wording that remains in the original discovery/proposal document. The proposal document is retained as decision history; this file is the authoritative execution lock for RWD-01.

The following are locked for RWD-01 implementation:

- **R48:** immutable ACTIVE package-subscription snapshot is the reward source authority.
- **R49:** `FIXED` and `RANDOM_RANGE` are initially executable; `MANUAL` and `RULE_BASED` fail closed.
- **R50:** `USER_NET_AFTER_SPLIT` is initially executable; `GROSS_BEFORE_SPLIT` fails closed until a recipient/distribution engine exists.
- **R51:** initial executable schedule is `NEXT_CALENDAR_DAY + DAILY_CALENDAR + CALENDAR_DAYS + EVERY_DAY`; other calendar modes fail closed.
- **R52:** the subscription `settlementTimezone` controls local reward-day boundaries; reward event stores logical reward date and actual posting time.
- **R53:** initial cap/principal semantics are `TOTAL_RETURN + INCLUDED_IN_TOTAL_RETURN`; principal consumes cap once at activation and is not credited back by RWD-01.
- **R54:** initial immutable cap contribution policy is package reward = COUNT; referral commission/team commission/award reward/other income = DO_NOT_COUNT.
- **R55:** current seeded cycle action auto-starts the next cycle while eligible; cap/lifetime completion stops future rewards; final reward is clipped to exact cap headroom.
- **R56:** package rewards use balanced immutable ledger posting: debit `SYSTEM/PACKAGE_REWARD_EXPENSE`, credit USER `PACKAGE_EARNINGS`; reward event, cap state and ledger commit atomically.
- **R57:** scheduler/worker and authorized reconciliation must call the same authoritative idempotent reward-processing service.
- **R58:** existing-subscription rollout is versioned/configurable. Initial live policy is `FORWARD_ONLY_FROM_POLICY_EFFECTIVE`; no reward backfill is created for settlement days before the effective published reward policy. `RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE` remains a future selectable versioned mode and must fail closed until its controlled catch-up engine is explicitly implemented and accepted.

No arbitrary reward amount or balance mutation path is approved.

## Q58 rollout semantics

For the initial forward-only policy:

```text
scheduleAnchor = MAX(subscription.activatedAt, rewardPolicy.effectiveFrom)
first payable reward boundary = next local calendar-day boundary after scheduleAnchor
```

The natural package lifetime is **not reset** by RWD-01 rollout. `goalDays` and cycle numbering continue from the immutable subscription activation schedule. Therefore an older package may have fewer payable future days than a newly activated package, and a package whose lifetime has already elapsed receives no retroactive reward.

Example:

```text
subscription activated: 2026-08-20
reward policy effective: 2026-08-28
first payable boundary:  2026-08-29 local settlement time
2026-08-21 through 2026-08-28: no backfill
```

The published policy row is immutable historical authority for the state/events created under it.

## Exact decimal settlement invariant

RWD-01 keeps the existing exact-decimal financial standard. The selected reward rate is persisted at six decimal places. Calculated/postable money is settled at ledger precision `DECIMAL(20,8)` using **round-down** semantics before posting or cap consumption. This prevents hidden fractional dust from over-crediting the USER or exceeding the configured cap. The immutable event stores the selected rate, calculated reward, posted reward, cap-before and cap-after values used by the transaction.
