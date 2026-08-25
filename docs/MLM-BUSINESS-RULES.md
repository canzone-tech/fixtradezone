# FixTradeZone — MLM / Package / Reward Business Rules v1.0

**Status:** LOCKED DISCOVERY BASELINE  
**Purpose:** Canonical business-logic reference before MLM development.

## Global Rules — LOCKED

**Configuration-first:** Package names, amounts, reward ranges, MLM level count, commission percentages, qualification thresholds, cycle durations, cap multipliers, release modes, eligibility modes, routing behavior, reward timing, and other commercial behavior must be configurable wherever reasonably possible.

**Plan versioning:** Every financial/business event resolves against the applicable plan version at the time of the event. Later configuration changes must not rewrite historical calculations.

**Non-configurable integrity rules:**
- self-referral forbidden
- referral cycles forbidden
- exact decimal arithmetic for money
- idempotent event processing
- no silent deletion/rewrite of historical financial entries
- reversals through linked reversal/adjustment entries
- privileged changes require authorization and audit
- sponsor changes record old sponsor, new sponsor, actor, reason, timestamp
- backend validation remains authoritative
- configuration must pass logical validation before publication
- historical events retain the rule/version actually used

---


## Q1. Sponsor at Registration

**Options**
- **A. Mandatory referral:** no registration without a valid referral.
- **B. Optional referral + default sponsor:** valid referral assigns that sponsor; otherwise configured default/company sponsor.
- **C. Optional referral + no sponsor:** referral optional and user may remain sponsorless.

**Example**
```text
A referral link → B registers → B sponsor = A
C registers directly with no referral → ?
```

**LOCKED:** **B**. No-referral registration goes under a **configurable default sponsor**; never hard-coded.

---


## Q2. Sponsor Change

**Options**
- **A. Immutable:** sponsor can never change.
- **B. Normally permanent; SUPER_ADMIN may change exceptionally.**
- **C. Authorized ADMIN/SUPER_ADMIN may change.**

**LOCKED:** **Hybrid B + controlled C.**

Rules:
```text
Sponsor normally permanent
SUPER_ADMIN always has exceptional authority
SUPER_ADMIN may delegate sponsor-change permission to ADMIN
reason required
old/new sponsor recorded
actor + timestamp recorded
self-sponsor blocked
cycle creation blocked
audit mandatory
```

---


## Q3. Number of Referral Levels

**Options**
- **A. Exactly 5 levels; percentages configurable.**
- **B. Level count + percentages configurable.**

**Example default**
```text
L1 20%
L2 8%
L3 5%
L4 3%
L5 2%
```

**LOCKED:** **B**. Engine must use a generic level configuration, not fixed `level1..level5` business logic.

---


## Q4. Commission Calculation Base

**Options**
- **A. Package matching:** `MIN(receiver package, downline package)`
- **B. Full downline package**
- **C. Level-specific/custom base**

**Example**
```text
Upline = $50
Downline = $500
L1 = 20%

Matching base = $50
Commission = $10
```

**LOCKED:** **A — Package matching is the canonical current base rule.**

---


## Q5. Package Matching by Level

**Options**
- **A. Same matching on all levels**
- **B. Matching only on L1**
- **C. Configurable per level**

**Example**
```text
L1 20% matching ON
L2 8%  matching ON
L3 5%  matching OFF
```

When ON:
```text
eligibleBase = MIN(receiverPackageBase, downlinePackage)
```

When OFF:
```text
eligibleBase = downlinePackage
```

**LOCKED:** **C**.

---


## Q6. Commission Trigger

**Options**
- **A. First package only**
- **B. Every approved purchase**
- **C. Purchase + upgrade using incremental upgrade amount**
- **D. Fully configurable**

**Configurable events**
```text
first purchase ON/OFF
new purchase ON/OFF
renewal ON/OFF
upgrade ON/OFF
upgrade base FULL/INCREMENTAL
```

**Example**
```text
$100 → $500 upgrade
INCREMENTAL = $400
FULL = $500
```

**LOCKED:** **D**.

---


## Q7. Active Package Required for Upline Commission

**Options**
- **A. Lost**
- **B. Pending**
- **C. Pass-up**
- **D. Configurable**

**Example**
```text
A sponsors B
A inactive
B buys $500
```

Config:
```text
activePackageRequired ON/OFF
if inactive → LOST / PENDING / PASS_UP
```

**LOCKED:** **D**.

---


## Q8. Pass-up / Compression

**Options**
- **A. PASS_SAME_LEVEL**
- **B. COMPRESS_LEVELS**
- **C. SKIP**
- **D. Configurable**

**Example**
```text
A → B → C → D
D purchases
C inactive
B active
A active
```

Supported:
```text
SKIP
PASS_SAME_LEVEL
COMPRESS_LEVELS
PENDING
```

**LOCKED:** **D**.

---


## Q9. Active Packages per User

**Options**
- **A. Single active package**
- **B. Multiple active packages**
- **C. Configurable**

If multiple:
```text
HIGHEST_ACTIVE_PACKAGE
TOTAL_ACTIVE_PACKAGE_VALUE
PRIMARY_PACKAGE
```

**LOCKED:** **C**.

---


## Q10. Cancellation / Refund / Reversal

**Options**
- **A. Full reversal**
- **B. No reversal**
- **C. Configurable by event/status**

**Example**
```text
REFUND → REVERSE/KEEP
CHARGEBACK → REVERSE/KEEP
ADMIN_CANCELLATION → REVERSE/KEEP
PACKAGE_TERMINATION → REVERSE/KEEP
```

Safe default: financial reversal reverses related commission, team volume, and affected qualification through **linked reversal entries**, not deletion.

**LOCKED:** **C**.

---


## Q11. Team Business Calculation

**Options**
- **A. EXACT_LEVEL**
- **B. CUMULATIVE_TO_LEVEL**
- **C. Configurable**

Supported:
```text
EXACT_LEVEL
CUMULATIVE_TO_LEVEL
FULL_SUBTREE
```

**Example**
```text
A
└─ B buys $500     → A L1 +$500
   └─ C buys $1000 → A L2 +$1000
```

**LOCKED:** **C**. Current poster appears closest to `EXACT_LEVEL` as a default interpretation.

---


## Q12. Award Qualification Period

**Options**
- **A. Lifetime**
- **B. Monthly**
- **C. Rolling**
- **D. Configurable**

Supported:
```text
LIFETIME
MONTHLY
ROLLING_DAYS
FIXED_CAMPAIGN_PERIOD
```

**LOCKED:** **D**.

---


## Q13. Multiple Award Payout Mode

**Options**
- **A. CUMULATIVE**
- **B. HIGHEST_ONLY**
- **C. DIFFERENTIAL**
- **D. Configurable**

**Example**
```text
A=$50 B=$100 C=$500

CUMULATIVE → $650 total
HIGHEST_ONLY → $500 target
DIFFERENTIAL → $50 + $50 + $400 = $500 total
```

**LOCKED:** **D**.

---


## Q14. Package Requirement for Award Qualification

**Options**
- **A. CURRENT_ACTIVE**
- **B. EVER_ACTIVATED**
- **C. Configurable**

Supported:
```text
CURRENT_ACTIVE
EVER_ACTIVATED
NO_PACKAGE_REQUIRED
```

Also configurable:
```text
minimum required package/tier
exact package vs minimum package
```

**LOCKED:** **C**.

---


## Q15. Upgrade Contribution to Team Business

**Options**
- **A. INCREMENTAL**
- **B. FULL_NEW_PACKAGE**
- **C. Configurable**

**Example**
```text
$100 → $500
INCREMENTAL = $400
FULL_NEW_PACKAGE = $500
```

**LOCKED:** **C**.

Team-business upgrade rule and referral-commission upgrade rule remain separate settings.

---


## Q16. Commission Release

**Options**
- **A. IMMEDIATE**
- **B. HOLD/PENDING**
- **C. Configurable**

Supported:
```text
IMMEDIATE
HOLD_PERIOD
MANUAL_APPROVAL
CONDITION_BASED
```

**Example**
```text
package approved
→ commission PENDING
→ configured hold completes
→ AVAILABLE
```

**LOCKED:** **C**.

---


## Q17. Earnings Counted Toward 2X/3X/4X Cap

**Options**
- **A. Package return only**
- **B. Package + referral**
- **C. All earnings**
- **D. Configurable per earning type**

**Example**
```text
package_return ON/OFF
referral_commission ON/OFF
team_commission ON/OFF
award_reward ON/OFF
other_income ON/OFF
```

**LOCKED:** **D**.

---


## Q18. Future Plan Changes

**Options**
- **A. New users/packages only**
- **B. Apply immediately to everyone**
- **C. Effective-date model**
- **D. Configurable migration mode**

Supported:
```text
NEW_ENROLLMENTS_ONLY
NEW_PACKAGE_ACTIVATIONS
ALL_FUTURE_EVENTS
EFFECTIVE_DATE
```

**Example**
```text
old L1 = 20%
new L1 = 15%
migration mode decides future applicability
historical 20% events remain unchanged
```

**LOCKED:** **D**.

---


## Q19. Referral Code / Link Format

**Options**
- **A. System random**
- **B. Username**
- **C. Configurable**

Supported:
```text
SYSTEM_RANDOM
USERNAME
CUSTOM_PREFIX_RANDOM
CUSTOM_PATTERN
```

**Example**
```text
Code: FTZ8K4P2
Link: /register?ref=FTZ8K4P2
```

**LOCKED:** **C**. Recommended default: immutable system-generated unique code. Tree relation is stored by stable user ID, not display code.

---


## Q20. Founder / Company Root Architecture

**Options**
- **A. One fixed root**
- **B. Configurable default root/sponsor**
- **C. Multiple roots**
- **D. Configurable architecture**

Supported:
```text
PRIMARY_ROOT_ACCOUNT
CONFIGURABLE_DEFAULT_SPONSOR
OPTIONAL_MULTIPLE_ROUTING_ACCOUNTS
```

**LOCKED:** **D**.

---


## Q21. Profit Distribution (e.g. 70/30)

**Options**
- **A. Fixed split**
- **B. Percentages configurable, recipients fixed**
- **C. Recipients + percentages configurable**
- **D. Configurable by package/plan**

**Example**
```text
Package A → User 70 / Creator 30
Package B → User 75 / Creator 25
```

Validation normally requires distribution shares to total 100%.

**LOCKED:** **D**.

---


## Q22. Meaning of Daily Reward %

**Options**
- **A. GROSS_BEFORE_SPLIT**
- **B. USER_NET_AFTER_SPLIT**
- **C. Configurable**

**Example**
```text
Package $100
rate 1%
split 70/30

GROSS_BEFORE_SPLIT:
gross $1 → user $0.70, creator $0.30

USER_NET_AFTER_SPLIT:
user reward itself = $1
other distribution handled separately
```

**LOCKED:** **C**.

---


## Q23. Actual Reward Rate Selection

**Options**
- **A. FIXED**
- **B. RANDOM_RANGE**
- **C. MANUAL**
- **D. Configurable**

Supported:
```text
FIXED
RANDOM_RANGE
MANUAL
RULE_BASED
```

Fields may include:
```text
FIXED_RATE
MIN_RATE
MAX_RATE
ROUNDING_RULE
effective dates
```

**Example**
```text
configured range 0.60%–0.80%
RANDOM_RANGE selects a valid rate within that range
```

**LOCKED:** **D**. Actual applied rate must be recorded with the event.

---


## Q24. Reward Generation Frequency

**Options**
- **A. Every calendar day**
- **B. Configured earning days**
- **C. Per cycle/event**
- **D. Configurable**

Supported:
```text
DAILY_CALENDAR
CONFIGURED_DAYS
PER_CYCLE
PER_EVENT
```

**LOCKED:** **D**.

---


## Q25. Cycle End Behavior

**Options**
- **A. COMPLETE_PACKAGE**
- **B. AUTO_START_NEXT_CYCLE**
- **C. MANUAL_RESTART**
- **D. Configurable**

Supported:
```text
COMPLETE_PACKAGE
AUTO_START_NEXT_CYCLE
MANUAL_RESTART
PAUSE_UNTIL_CONDITION
```

Also configurable:
```text
cycle duration
max cycles
package expiry
restart eligibility
```

**LOCKED:** **D**. Cycle duration and package lifetime are separate concepts.

---


## Q26. Meaning of 2X/3X/4X Cap

**Options**
- **A. TOTAL_RETURN**
- **B. PROFIT_ONLY**
- **C. Configurable**

**Example**
```text
Package $500, 3X

TOTAL_RETURN:
max total = $1500
max profit = $1000

PROFIT_ONLY:
max profit = $1500
principal handled separately
```

**LOCKED:** **C**. Current poster appears most consistent with `TOTAL_RETURN` as default.

---


## Q27. Action When Cap Is Reached

**Options**
- **A. COMPLETE_PACKAGE**
- **B. STOP_EARNINGS_KEEP_ACTIVE**
- **C. AUTO_RENEW**
- **D. Configurable**

Supported:
```text
COMPLETE_PACKAGE
STOP_EARNINGS_KEEP_ACTIVE
AUTO_RENEW
MANUAL_RENEW
PAUSE
```

**LOCKED:** **D**. Cap-reached action is independent from cycle-end action.

---


## Q28. Principal Treatment

**Options**
- **A. RETURN_SEPARATELY**
- **B. INCLUDED_IN_TOTAL_RETURN**
- **C. NON_REFUNDABLE_PACKAGE_VALUE**
- **D. Configurable**

**Example**
```text
$500 package, 3X total-return cap
principal treatment determines whether original $500 is separately returned,
included in the cap, or simply package activation value.
```

**LOCKED:** **D**. Refund/cancellation remains a separate rule.

---


## Q29. Package Activation Trigger

**Options**
- **A. PAYMENT_SUBMITTED**
- **B. PAYMENT_APPROVED**
- **C. MANUAL_ACTIVATION**
- **D. Configurable**

Supported:
```text
PAYMENT_SUBMITTED
PAYMENT_APPROVED
MANUAL_ACTIVATION
RULE_BASED
```

**Example**
```text
package selected
→ deposit assigned
→ payment made
→ txn ID submitted
→ payment reviewed
→ configured activation trigger
→ package ACTIVE
→ MLM/business events become eligible
```

**LOCKED:** **D**. Recommended safe default: `PAYMENT_APPROVED`. Processing must be idempotent.

---


## Q30. First Reward Start Time

**Options**
- **A. SAME_DAY**
- **B. NEXT_CALENDAR_DAY**
- **C. AFTER_FULL_INTERVAL**
- **D. Configurable**

Supported:
```text
SAME_DAY
NEXT_CALENDAR_DAY
AFTER_FULL_INTERVAL
CONFIGURED_START_TIME
NEXT_CYCLE_START
```

**Example**
```text
Activated 24 Aug 4:30 PM
same-day / next-day / full-interval / settlement-boundary are selectable behaviors
```

**LOCKED:** **D**. Timezone and settlement time must be explicit.

---


## Q31. Reward-Day / Cycle-Day Counting

**Options**
- **A. Calendar days**
- **B. Only eligible earning days**
- **C. Calendar cycle but selected reward days**
- **D. Fully configurable**

Supported independently:
```text
CYCLE_DAY_MODE =
- CALENDAR_DAYS
- ELIGIBLE_EARNING_DAYS

REWARD_DAY_MODE =
- EVERY_DAY
- SELECTED_WEEKDAYS
- CUSTOM_CALENDAR
```

**LOCKED:** **D**.

---



# Discovery Continuation / Amendment Policy — LOCKED

The discovery process does **not** stop at Question 31.

If any new ambiguity, calculation rule, business condition, exception, operational behavior, accounting treatment, package rule, commission rule, reward rule, eligibility rule, admin-control rule, or edge case is discovered during development or testing:

1. Create the next sequential question in this same document:
   - Q32, Q33, Q34, etc.
2. Preserve all meaningful options considered.
3. Include at least one concrete example/calculation where applicable.
4. Record the final decision as **LOCKED ANSWER**.
5. State whether the rule is:
   - configurable,
   - plan-versioned,
   - system-wide invariant, or
   - module-specific.
6. Record any validation, audit, reversal, idempotency, authorization, or historical-accounting implications.
7. Only after the rule is documented and locked should implementation depending on that rule proceed.
8. If an already-locked rule changes, do not silently edit history. Add an amendment/change note with:
   - previous decision,
   - new decision,
   - reason,
   - effective scope/date/version.

Repository source-of-truth path:

```text
docs/MLM-BUSINESS-RULES.md
```

This repository document is the canonical development reference. Chat decisions must be reflected in the repository document before dependent MLM business logic is considered complete.

---


## Q32. Existing Users — Referral Tree Migration Strategy

**Context**

The MLM referral foundation is being introduced after users may already exist in the database. Existing records do not contain historical sponsor/referral information, so the system must not invent relationships.

**Options**
- **A. ASSIGN_DEFAULT_SPONSOR:** all existing non-root users are automatically attached to the configured default sponsor.
- **B. LEAVE_UNASSIGNED_FOR_REVIEW:** existing users remain without an MLM sponsor until ADMIN/SUPER_ADMIN reviews and assigns the correct sponsor.
- **C. REQUIRE_EXPLICIT_MAPPING:** MLM activation is blocked until an explicit user-to-sponsor mapping is provided.
- **D. Configurable migration strategy**

Supported modes:
```text
EXISTING_USER_MIGRATION_MODE =
- ASSIGN_DEFAULT_SPONSOR
- LEAVE_UNASSIGNED_FOR_REVIEW
- REQUIRE_EXPLICIT_MAPPING
```

**Example**
```text
Existing database before MLM:

Founder
User A
User B
User C

No historical sponsor data exists.

LEAVE_UNASSIGNED_FOR_REVIEW:
Founder → ROOT
User A → sponsor pending
User B → sponsor pending
User C → sponsor pending

An authorized ADMIN/SUPER_ADMIN later assigns the verified sponsor.
```

**LOCKED:** **D — Existing-user migration strategy is configurable.**

**Initial FixTradeZone rollout:** **B — `LEAVE_UNASSIGNED_FOR_REVIEW`.**

Implementation implications:
- migration must not guess or manufacture historical sponsor relationships
- existing non-root users may temporarily have no referral profile/sponsor assignment or an explicit unassigned state, depending on final schema design
- new registrations after the referral module is enabled follow Q1 and use a supplied referral or configured default sponsor
- assignment/reassignment must obey Q2 authorization, cycle prevention, self-referral prevention, and auditing
- future import/deployment workflows may select a different migration mode through an explicitly versioned/configured process

---


## Q33. Package Price Denomination

**Context**

Package prices are displayed and funded through the USDT deposit flow. The
package catalogue must not silently introduce a USD/USDT conversion or an
unrecorded exchange-rate dependency.

**Options**
- **A. USDT denomination:** package prices are denominated directly in USDT; no
  USD/USDT conversion is performed.
- **B. USD denomination with locked quote:** package price is stored in USD and
  an immutable conversion quote is captured when a package is activated.
- **C. Multi-currency:** each package may be priced in one of multiple supported
  currencies with versioned conversion rules.

**LOCKED ANSWER:** **A — USDT denomination with no FX conversion.**

Rule classification: **plan-versioned package rule** with a current
system-supported currency of `USDT`.

Implementation implications:
- every package-plan item stores an explicit currency code
- package price uses `DECIMAL(20,8)` and must be positive
- monetary values are returned by JSON APIs as strings, never JavaScript numbers
- a future currency/FX capability requires a new approved plan/schema change
- historical package records retain their exact price, currency and plan-item ID

---


## Q34. Package Goal and Cycle Meaning

**Context**

The supplied plan contains both a package goal such as 90 or 150 days and a
shorter trade-cycle value. These values cannot be treated as synonyms.

**Options**
- **A. Lifetime plus separate cycle:** goal days define package lifetime while
  cycle days define a separate reward/activity cycle inside that lifetime.
- **B. Same duration:** goal and cycle are two labels for one duration.
- **C. Goal is display-only:** only cycle duration affects package behavior.

**LOCKED ANSWER:** **A — package lifetime and reward/activity cycle are separate.**

Rule classification: **plan-versioned package rule**.

Implementation implications:
- package items store typed `goalDays` and `cycleDays` columns
- both values must be positive; cycle duration cannot exceed package lifetime
- cycle completion and package completion remain separate future events
- any user-facing trade-cycle wording or activity is explicitly labelled
  `Simulated Trade Activity`; no real trading claim is permitted
- PKG-01 stores configuration only and does not generate cycle/reward events

---


## Q35. Initial Active-Package Mode

**Options**
- **A. SINGLE_ACTIVE:** a user may have only one active package.
- **B. MULTIPLE_ACTIVE with HIGHEST_ACTIVE_PACKAGE qualification.**
- **C. MULTIPLE_ACTIVE with TOTAL_ACTIVE_PACKAGE_VALUE qualification.**
- **D. MULTIPLE_ACTIVE with an explicitly selected PRIMARY_PACKAGE.**

**LOCKED ANSWER:** **A — initial mode is `SINGLE_ACTIVE`.** If a later approved
plan enables `MULTIPLE_ACTIVE`, its initial qualification basis is
`HIGHEST_ACTIVE_PACKAGE`.

Rule classification: **plan-versioned package rule**.

Implementation implications:
- PKG-01 versions the selected mode and multiple-package basis
- the later activation/subscription service enforces the rule transactionally
- changing the plan never rewrites historical user-package records
- PKG-01 does not create `UserPackage` or activation records

---

## Q36. Package Upgrade Lifecycle

**Options**
- **A. Incremental top-up and supersession:** charge the target price minus the
  source price, supersede the source record, preserve settled history, carry
  prior cap consumption, and restart the target lifetime.
- **B. Full-price replacement:** charge the full target price and replace the
  source package without carrying cap consumption.
- **C. Independent additional package:** retain the source and create a separate
  target package.

**LOCKED ANSWER:** **A — incremental top-up with linked supersession.**

Rule classification: **package/subscription lifecycle rule** whose applicable
commercial terms are **plan-versioned**.

Implementation implications:
- the original user-package record and settled events remain immutable
- the new record links to the superseded source record
- prior cap consumption carries forward through immutable ledger/event history
- the target package lifetime restarts at activation
- the upgrade source/idempotency key must be unique
- upgrades remain disabled until subscription, deposit/payment and ledger support
  exist; PKG-01 publishes no upgrade endpoint

---


## Q37. Package Renewal Lifecycle

**Options**
- **A. Manual terminal-state renewal:** after a terminal package state, pay the
  full current price and create a new record using the current published plan.
- **B. Automatic renewal:** renew automatically at cycle, lifetime or cap end.
- **C. Rollover renewal:** create a renewal while carrying value, time or unused
  cap from the old record.

**LOCKED ANSWER:** **A — manual renewal only after a terminal state.** Renewal
uses the full current price, the current published plan version and a new linked
user-package record, with no value, time or cap rollover.

Rule classification: **package/subscription lifecycle rule** whose applicable
commercial terms are **plan-versioned**.

Implementation implications:
- no auto-renewal is enabled in the initial plan
- a renewal never edits or reactivates the original record
- renewal payment/activation is idempotent and audited in the later modules
- PKG-01 publishes no renewal endpoint

---


## Q38. Meaning of the Published/Displayed Reward Rate

**Options**
- **A. USER_NET_AFTER_SPLIT:** the displayed package percentage is the user's
  net rate and is not later reduced by a distribution split.
- **B. GROSS_BEFORE_SPLIT:** the displayed rate is gross and an explicit split
  determines the user's lower net rate.
- **C. Display both gross and net rates.**

**LOCKED ANSWER:** **A — `USER_NET_AFTER_SPLIT`.**

Rule classification: **plan-versioned package rule**.

Implementation implications:
- the rate-meaning field is explicit on each package-plan item
- the user catalogue labels the range as the user/net rate
- the later reward event records the actual applied rate immutably
- distribution recipients and percentages remain a later Reward/Commission
  contract and cannot silently reduce the displayed user rate

---


## Q39. Cap Basis and Principal Treatment

**Options**
- **A. TOTAL_RETURN + INCLUDED_IN_TOTAL_RETURN:** the cap multiplier includes
  the package principal; principal is not paid separately at completion.
- **B. PROFIT_ONLY + RETURN_SEPARATELY:** the cap applies only to profit and the
  principal is returned separately.
- **C. TOTAL_RETURN + RETURN_SEPARATELY:** principal is separately returned in
  addition to the total-return cap.

**LOCKED ANSWER:** **A — `TOTAL_RETURN` with
`INCLUDED_IN_TOTAL_RETURN`.** There is no separate principal payout at normal
completion. Refund/cancellation rules remain independent.

Rule classification: **plan-versioned package rule** with later ledger-backed
accounting effects.

Example:
```text
Package price = 500 USDT
Cap multiplier = 3X
Maximum total return = 1,500 USDT
Maximum profit component = 1,000 USDT
Separate principal payout at completion = 0 USDT
```

Implementation implications:
- maximum return/profit is derived, not stored as a conflicting mutable value
- later cap consumption is calculated from immutable, typed ledger events
- cap inclusion remains configurable by earning type under Q17
- refunds/reversals use linked reversal entries and do not rewrite history
- PKG-01 stores terms only and creates no balances, earnings or cap consumption

---


## PKG-01 Approved Initial Safe Defaults — 2026-08-25

The Founder approved these initial **configured V1 draft values**. They are not
hardcoded engine invariants and may change only through a validated, audited new
plan version:

```text
currency                         = USDT
activationTrigger                = PAYMENT_APPROVED
planMigrationMode                = NEW_PACKAGE_ACTIVATIONS
activePackageMode                = SINGLE_ACTIVE
multipleActivePackageBasis       = HIGHEST_ACTIVE_PACKAGE
rewardRateMode                   = RANDOM_RANGE
rewardRateMeaning                = USER_NET_AFTER_SPLIT
settlementTimezone               = UTC
firstRewardStart                 = NEXT_CALENDAR_DAY
rewardFrequency                  = DAILY_CALENDAR
cycleDayMode                     = CALENDAR_DAYS
rewardDayMode                    = EVERY_DAY
capBasis                         = TOTAL_RETURN
principalTreatment               = INCLUDED_IN_TOTAL_RETURN
capReachedAction                 = COMPLETE_PACKAGE
renewalMode                      = MANUAL_AFTER_TERMINAL
autoRenewal                      = disabled
upgrade                          = disabled until dependent modules exist
initial package availability     = AVAILABLE
ADMIN package permissions        = none assigned initially
```

PKG-01 still exposes catalogue/configuration only. Package activation remains
unavailable until the approved Deposit/Payment and UserPackage/ledger boundaries
are implemented.

---

# Current Reference Figures from Supplied MLM Plan Image

These are **initial/default reference values only**, not architecture constants.

## Referral levels shown
```text
L1 = 20%
L2 = 8%
L3 = 5%
L4 = 3%
L5 = 2%
```

## Package matching example shown
```text
Your package $50 / referral package $50 → eligible $50 → L1 @20% = $10
Your package $5  / referral package $50 → eligible $5  → L1 @20% = $1
```

## Packages shown

| Package | Amount | Daily Reward Approx. | Cap | Max Profit Shown | Goal |
|---|---:|---:|---:|---:|---:|
| Neural Scout | $5 | 0.40–0.60% | 2X | $5 | 90d |
| Neural Voyager | $25 | 0.50–0.70% | 2X | $25 | 90d |
| Neural Navigator | $50 | 0.60–0.80% | 2X | $50 | 90d |
| Neural Strategist | $100 | 0.70–0.90% | 2X | $100 | 90d |
| Quant Core | $500 | 0.80–1.00% | 3X | $1,000 | 90d |
| Quant Prime | $1,000 | 0.90–1.20% | 3X | $2,000 | 90d |
| Quant Apex | $2,000 | 1.00–1.50% | 3X | $4,000 | 90d |
| Quant Titan | $4,000 | 1.10–1.80% | 4X | $12,000 | 150d |
| Quant Sovereign | $5,000 | 1.20–2.00% | 4X | $15,000 | 150d |

## Trade cycle ranges shown

| Package Amount | Cycle |
|---|---:|
| $5–$24 | 10 days |
| $25–$49 | 15 days |
| $50–$99 | 20 days |
| $100–$499 | 25 days |
| $500–$999 | 30 days |
| $1,000–$1,999 | 60 days |
| $2,000–$3,999 | 90 days |
| $4,000–$4,999 | 120 days |
| $5,000+ | 150 days |

## Award / Reward table shown

| Type | Active Package | L1 Business | L2 Business | L3 Business | L4 Business | Reward |
|---|---:|---:|---:|---:|---:|---:|
| A | $50 | $500 | $1,000 | — | — | $50 |
| B | $100 | $2,000 | $10,000 | $15,000 | — | $100 |
| C | $500 | $10,000 | $25,000 | $50,000 | — | $500 |
| D | $1,000 | $20,000 | $100,000 | $150,000 | — | $1,000 |
| E | $2,000 | $50,000 | $150,000 | $250,000 | $400,000 | $2,000 |
| F | $5,000 | $70,000 | $250,000 | $350,000 | $500,000 | $5,000 |

---

# Implementation Interpretation

The MLM system is a **versioned rule engine**, not a set of hard-coded formulas tied to the current poster.

Expected domain separation:
- referral/sponsor tree
- referral plan/version
- package catalog/version
- user package activation/subscription
- team-business volume events
- commission rules + commission ledger
- award qualification rules
- award/reward ledger
- package reward/cycle rules
- cap accounting
- payment/deposit approval events
- configuration publication/effective dates
- audit history

## Development Gate

For each MLM module:
```text
implement vertical slice
→ local DB/migration verification
→ local API verification
→ Postman verification
→ lint/tests/build
→ docs update
→ then next module / PR
```

# Discovery Status

**Questions 1–39: LOCKED.**

Every question above intentionally preserves:
- available options
- examples
- locked decision
- business/calculation meaning

This file should be committed under the repository `docs/` directory and updated only through explicit versioned decisions.
