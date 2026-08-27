# COMM-01 — Referral Commission Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

## Purpose

COMM-01 converts an immutable ACTIVE package-subscription event into immutable,
idempotent referral-commission accounting according to an effective published
commission plan.

It consumes the existing MLM-01 referral tree, SUB-02 package subscription
snapshot and WAL-01 immutable ledger. It does not calculate package rewards,
team-business awards, caps, withdrawals or simulated activity.

## Source-of-truth event chain

```text
approved/accounted deposit
→ immutable package subscription becomes ACTIVE
→ COMM-01 resolves commission plan at subscription.activatedAt
→ reconstruct sponsor path at subscription.activatedAt
→ snapshot receiver package qualification at that event time
→ calculate exact eligible base + rate + amount
→ write immutable commission outcome
→ if release mode is executable, post balanced ledger transaction
```

A deposit submission, pending review, accounting entry without package
activation, or mutable current UI state is never a commission trigger.

## Existing locked rules consumed

COMM-01 preserves the previously locked MLM decisions:

- Q3 — level count and rates are configurable; no hard-coded level1..level5 engine.
- Q4 — canonical package-matching base is `MIN(receiver package basis, downline package)`.
- Q5 — package matching may be configured per level.
- Q6 — commission trigger behavior is configurable by purchase lifecycle event.
- Q7 — active-package requirement and inactive-upline treatment are configurable.
- Q8 — skip/pass-up/compression behavior is configurable.
- Q9 — multiple-active package qualification supports HIGHEST/TOTAL/PRIMARY semantics.
- Q16 — commission release behavior is configurable.
- Q18 — historical events retain the exact effective plan/version used.

Exact DECIMAL arithmetic, idempotency, immutable history, linked reversals,
backend authority and audited privileged configuration remain non-configurable
integrity rules.

## Q40–Q47 continuity amendment

Earlier project continuity preserved Founder approval of “Option A for Q40–Q47
and the safe defaults”, but the exact old question/option wording was not
successfully committed to the repository. COMM-01 therefore does not pretend to
reconstruct those missing words.

For implementation, the following explicit safe execution boundary is approved
as the COMM-01 amendment:

### Q40 — Live commission source event

Options:

- A. ACTIVE immutable package subscription.
- B. approved payment before package activation.
- C. submitted payment/TXID.

**LOCKED ANSWER: A.**

Only a successfully created immutable ACTIVE package subscription is eligible to
start commission processing.

### Q41 — Commission configuration activation

Options:

- A. versioned DRAFT/PUBLISHED commission plan with effective dates.
- B. mutable singleton percentages.
- C. hard-coded percentages.

**LOCKED ANSWER: A.**

No commission payout occurs without an effective PUBLISHED commission plan.
Publication is SUPER_ADMIN-only, audited, non-backdated and overlap-safe.

### Q42 — Initial reference level draft

Options:

- A. seed the supplied reference levels as an unpublished draft.
- B. immediately make supplied reference levels live.
- C. hard-code the supplied levels.

**LOCKED ANSWER: A.**

Initial DRAFT reference:

```text
L1 20%
L2  8%
L3  5%
L4  3%
L5  2%
```

All five levels start with package matching enabled. The draft has no financial
effect until explicitly reviewed and published.

### Q43 — Initial executable inactive-upline behavior

Options:

- A. `LOST`.
- B. `PENDING`.
- C. `PASS_UP`.

**LOCKED ANSWER: A for the first executable engine.**

`PENDING` and `PASS_UP` remain valid future configuration values, but publication
using them fails closed until their release/routing engines exist.

### Q44 — Initial executable compression behavior

Options:

- A. `SKIP`.
- B. `PASS_SAME_LEVEL`.
- C. `COMPRESS_LEVELS`.
- D. `PENDING`.

**LOCKED ANSWER: A for the first executable engine.**

Other values remain reserved configuration values and cannot be published until
implemented.

### Q45 — Initial executable release mode

Options:

- A. `IMMEDIATE`.
- B. `HOLD_PERIOD`.
- C. `MANUAL_APPROVAL`.
- D. `CONDITION_BASED`.

**LOCKED ANSWER: A for the first executable engine.**

Non-immediate modes remain reserved and fail closed at publication until their
release engines exist.

### Q46 — Financial posting model

Options:

- A. balanced immutable ledger transaction into USER Referral Commission bucket.
- B. mutate a balance column directly.
- C. calculate only at read time.

**LOCKED ANSWER: A.**

Posting model:

```text
DEBIT  SYSTEM / REFERRAL_COMMISSION_EXPENSE / <currency>
CREDIT USER   / REFERRAL_COMMISSION         / <currency>
```

The ledger transaction and AVAILABLE commission event commit together.

### Q47 — Historical retry/reconciliation authority

Options:

- A. deterministic source keys + immutable event-time snapshots.
- B. recompute using today’s sponsor tree/plan on retry.
- C. allow ADMIN to edit prior commission amounts.

**LOCKED ANSWER: A.**

Processing is idempotent. Sponsor routing is reconstructed at the package
subscription event timestamp. A later sponsor or configuration change never
rewrites a settled historical result.

## Commission plan model

A versioned plan contains:

```text
status = DRAFT | PUBLISHED
revision
firstPurchaseEnabled
newPurchaseEnabled
renewalEnabled
upgradeEnabled
upgradeBaseMode = FULL | INCREMENTAL
activePackageRequired
inactiveUplineAction = LOST | PENDING | PASS_UP
compressionMode = SKIP | PASS_SAME_LEVEL | COMPRESS_LEVELS | PENDING
releaseMode = IMMEDIATE | HOLD_PERIOD | MANUAL_APPROVAL | CONDITION_BASED
holdPeriodHours
level rules[]
  level
  enabled
  ratePercent
  packageMatchingEnabled
effectiveFrom/effectiveTo
```

Initial draft safe values:

```text
firstPurchaseEnabled = true
newPurchaseEnabled = true
renewalEnabled = false
upgradeEnabled = false
upgradeBaseMode = INCREMENTAL
activePackageRequired = true
inactiveUplineAction = LOST
compressionMode = SKIP
releaseMode = IMMEDIATE
holdPeriodHours = 0
```

These are draft configuration values, not hard-coded engine constants.

## Publication safety

COMM-01 publication requires:

- SUPER_ADMIN authority;
- optimistic revision match;
- explicit reason;
- at least one enabled level;
- levels are positive and unique;
- rates are greater than zero and at most 100%;
- enabled matching requires active-package qualification;
- no backdated effective start;
- no overlapping published commission plans;
- first/new purchase cannot both be disabled while current package activation is the only executable trigger;
- initial implementation allows publication only with `LOST + SKIP + IMMEDIATE`;
- future engines may widen the publishable configuration set without rewriting historical plans.

## Package matching and receiver basis

For each upline level:

```text
sourceBase = source subscription price
receiverPackageBasis = applicable active package basis at source activatedAt

if packageMatchingEnabled:
  eligibleBase = MIN(receiverPackageBasis, sourceBase)
else:
  eligibleBase = sourceBase

commissionAmount = eligibleBase * ratePercent / 100
```

Money uses `DECIMAL(20,8)`. Rates use exact decimal arithmetic. JSON returns
monetary/rate values as strings.

For multiple active packages, receiver qualification follows the applicable
package snapshot basis:

- `HIGHEST_ACTIVE_PACKAGE` — highest same-currency active package value.
- `TOTAL_ACTIVE_PACKAGE_VALUE` — sum of same-currency active package values.
- `PRIMARY_PACKAGE` — reserved until explicit primary-package selection exists;
  processing fails closed rather than guessing.

## Sponsor-tree historical snapshot

Sponsor routing is resolved at `subscription.activatedAt`, preferably from the
immutable `referral_sponsor_history` sequence. Current referral-profile state
must not silently rewrite a historical commission route after sponsor
reassignment.

Self-referral and referral cycles remain forbidden. A detected historical cycle
aborts processing for investigation.

## Idempotency

One processing run exists per source subscription.

Each commission level has a deterministic source identity:

```text
SUBSCRIPTION:<subscriptionId>:REFERRAL_COMMISSION:L<level>:<receiverUserId>
```

A retry returns/reuses the prior run/events. It never duplicates the commission
or ledger posting.

Automated unit/service coverage verifies deterministic source identity and
idempotent processing behavior. During the 2026-08-27 local Postman round, the
standalone retry request did not execute because its Postman subscription-id
variable was unresolved; this request was not used as acceptance evidence and
no runtime idempotency claim is made from that request.

## No-effective-plan behavior

If there is no effective published commission plan at the exact source
subscription activation time, COMM-01 records a terminal `NO_EFFECTIVE_PLAN`
outcome for that source event. Publishing a later plan does not retroactively
manufacture commission for the older activation.

Local browser reconciliation of pre-COMM-01 historical subscriptions produced
`NO_EFFECTIVE_PLAN` as designed. Those older activations were not back-paid.

## Ledger safety

For every AVAILABLE immediate commission:

- ensure the USER Referral Commission account exists with CREDIT normal side;
- ensure the system Referral Commission Expense account exists with DEBIT normal side;
- insert one `REFERRAL_COMMISSION_CREDIT` ledger transaction;
- insert equal debit and credit entries;
- validate balance before commit;
- update transactional balance read models;
- link the commission event to the immutable ledger transaction;
- audit the calculation and posting snapshots.

No arbitrary balance-edit endpoint exists.

## API surface

USER:

```text
GET /commissions/me
```

ADMIN/SUPER_ADMIN:

```text
GET  /admin/commission-plans
GET  /admin/commission-plans/:planVersionId
POST /admin/commission-plans/drafts
PATCH /admin/commission-plans/:planVersionId
POST /admin/commission-plans/:planVersionId/publish
GET  /admin/commissions
GET  /admin/commissions/reconciliation
POST /admin/subscriptions/:subscriptionId/process-commissions
```

The process POST is an idempotent recovery/reconciliation action, not an
alternate payout path.

## RBAC

COMM-01 introduces:

```text
commissions.read
commissions.plan.manage
commissions.reconcile
```

SUPER_ADMIN retains existing bypass behavior. ADMIN receives no new commission
mutation authority by default; permissions must be explicitly delegated.

## Frontend acceptance surface

ADMIN:

- `/commissions` — effective plan status, draft/version workspace, level rules,
  immutable commission events, reconciliation queue and authorized retry action.
- mutation feedback remains viewport-visible.

USER:

- `/user/referrals` adds Referral Commission balance/history sourced from the
  ledger/event API.
- no fabricated projected/estimated commission is shown as earned money.

## Local acceptance — 2026-08-27

Status: **GREEN for the COMM-01 core financial flow**.

Verified locally after migration `0013_referral_commission_foundation`:

- database migration applied successfully after a verified pre-migration backup;
- four COMM-01 tables created;
- seeded commission Plan V1 published from the reviewed draft;
- effective executable policy is `LOST + SKIP + IMMEDIATE`;
- levels are L1 20%, L2 8%, L3 5%, L4 3%, L5 2%;
- package matching is enabled on all five seeded levels;
- `commissions.read`, `commissions.plan.manage`, and `commissions.reconcile`
  permissions exist;
- ledger schema includes `REFERRAL_COMMISSION_EXPENSE` and
  `REFERRAL_COMMISSION_CREDIT`;
- root `npm run verify:milestone` completed successfully;
- backend and frontend local runtimes returned HTTP 200;
- fresh USER A and USER B were enrolled with B directly sponsored by A;
- both fresh QA deposits were approved/accounted and then completed through the
  configured MANUAL package activation path;
- USER A held an ACTIVE 5 USDT package before USER B activation;
- USER B activated an ACTIVE 5 USDT package under the effective COMM-01 plan;
- B → A L1 package matching resolved `MIN(5, 5) = 5 USDT`;
- B → A L1 rate resolved to 20%;
- exact AVAILABLE commission created: `1.00000000 USDT`;
- ADMIN `/commissions` displayed the immutable L1 AVAILABLE event;
- USER A `/user/referrals` displayed a `1.00 USDT` Referral Commission ledger
  balance and the immutable B → A L1 event;
- higher/upline events with no qualifying active package were recorded as
  `LOST` with zero eligible base, matching the published policy;
- USER A direct-referral view retained USER B as ACTIVE / ASSIGNED;
- Postman API checks other than the standalone retry-variable request completed;
- admin event/ledger/reconciliation readbacks passed in the acceptance round.

Observed immutable events included:

```text
B → A          L1  eligible base 5.00 USDT  rate 20%  commission 1.00 USDT  AVAILABLE
B → SUPERADMIN L2  eligible base 0.00 USDT  rate  8%  commission 0.00 USDT  LOST
A → SUPERADMIN L1  eligible base 0.00 USDT  rate 20%  commission 0.00 USDT  LOST
```

The zero-value LOST events are intentional evidence of active-package
qualification plus `LOST` inactive-upline handling; they are not payout errors.

## Explicitly deferred

COMM-01 does not implement:

- pass-up/compression execution beyond initial `SKIP`;
- pending-upline release;
- hold/manual/condition release engines;
- renewal or upgrade commission execution;
- commission reversals for refund/chargeback (schema/source links must preserve
  future linked reversal capability);
- team-business volume;
- award rewards;
- package daily rewards/caps;
- withdrawal/payout.

## Acceptance gate

Completed:

1. implementation on `feature/referral-commission-foundation`;
2. local Prisma/schema + migration gate;
3. migration backup/status/deploy;
4. backend + frontend code gate;
5. combined browser + Postman/API runtime acceptance;
6. SQL/ledger/API readback;
7. automated idempotency coverage;
8. docs/current-state update.

Remaining before merge:

9. final feature diff review;
10. PR to `main` and CI/approval.
