# RWD-01 — Founder Lock Addendum

Status: **R48–R57 LOCKED / APPROVED 2026-08-27**.

This addendum records Founder approval of the proposed R48–R57 execution boundary in `docs/REWARDS-CAPS-LIFECYCLE.md`.

The following are now locked for RWD-01 implementation:

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

No arbitrary reward amount or balance mutation path is approved.

## Newly discovered rollout ambiguity — Q58 pending

R48–R57 do not define whether subscriptions already ACTIVE before RWD-01 becomes executable should receive rewards for settlement days that passed before the reward engine/policy was enabled.

This materially changes financial liability and therefore must not be inferred silently.

Until Q58 is locked, implementation may create schema, APIs, deterministic calculation, cap/lifecycle state, UI and reconciliation plumbing, but automatic money posting for pre-existing ACTIVE subscriptions must fail closed.
