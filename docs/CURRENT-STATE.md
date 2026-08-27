# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-27

Repository state plus completed local verification are the acceptance authority.

## Active Development Branch

`feature/referral-commission-foundation`

## Mainline Baseline

`main` contains the merged cumulative post-MLM business foundation through PR #16:

- PKG-01 package-plan foundation;
- DEP-01 deposits foundation;
- WAL-01 immutable wallet/ledger foundation;
- SUB-02 package subscription / activation.

Applied migration history must never be rewritten. MySQL remains the relational,
business and accounting source of truth.

## COMM-01 — Referral Commission Foundation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

Canonical contract:

`docs/REFERRAL-COMMISSION-FOUNDATION.md`

COMM-01 converts immutable ACTIVE package-subscription events into versioned,
immutable and ledger-backed referral commission outcomes.

### Effective executable policy

The first publishable execution engine is intentionally limited to:

```text
inactive upline = LOST
compression     = SKIP
release mode    = IMMEDIATE
```

Deferred routing/release modes remain configurable in the contract but fail
closed at publication until their dedicated engines exist.

### Versioned commission plan

Migration `0013_referral_commission_foundation` establishes:

- versioned DRAFT/PUBLISHED commission plans;
- configurable level rules;
- immutable processing runs;
- immutable commission events;
- exact DECIMAL calculation snapshots;
- deterministic source identities;
- Referral Commission ledger posting support;
- COMM-01 RBAC permissions.

The supplied reference levels were seeded as a DRAFT only and then explicitly
published during local acceptance:

```text
L1 20%
L2  8%
L3  5%
L4  3%
L5  2%
```

Package matching is enabled per level.

### Financial source authority

Commission processing starts only from an immutable ACTIVE package subscription.

A submitted deposit, approved deposit by itself, or accounting transaction by
itself is not a commission event.

The canonical package-matching calculation is:

```text
eligibleBase = MIN(receiver active-package basis, source package value)
commission   = eligibleBase × level rate / 100
```

AVAILABLE immediate commission posts through the immutable balanced ledger:

```text
DEBIT  SYSTEM / REFERRAL_COMMISSION_EXPENSE
CREDIT USER   / REFERRAL_COMMISSION
```

No arbitrary balance mutation endpoint exists.

### Historical behavior

Sponsor routing is reconstructed at the source subscription activation time.
Published commission-plan versions and event calculation values are preserved
historically.

If no commission plan was effective at a historical activation timestamp,
processing records `NO_EFFECTIVE_PLAN`; later publication does not create a
retroactive payout.

Local browser reconciliation of older pre-COMM-01 subscriptions confirmed this
behavior.

## COMM-01 Local Acceptance — GREEN

Completed locally on 2026-08-27:

- verified pre-migration MySQL backup;
- migration `0013_referral_commission_foundation` deployed successfully;
- DB readback verified all four COMM-01 tables;
- DB readback verified V1 DRAFT seed and L1–L5 reference rates;
- DB readback verified COMM-01 permissions and ledger enums;
- root `npm run verify:milestone` completed successfully;
- backend `/health` returned HTTP 200;
- frontend `/login` returned HTTP 200;
- ADMIN `/commissions` rendered versioned plan/rules, reconciliation and immutable history;
- USER `/user/referrals` rendered referral identity/network and ledger-backed commission history;
- fresh USER B was correctly assigned beneath fresh sponsor USER A;
- fresh USER A was activated on a 5 USDT package before USER B activation;
- fresh USER B was activated on a 5 USDT package under the effective commission plan;
- B → A L1 package matching resolved eligible base 5 USDT;
- B → A L1 20% produced exactly 1.00000000 USDT AVAILABLE commission;
- USER A Referral Commission wallet displayed 1.00 USDT;
- ADMIN immutable history displayed the B → A L1 AVAILABLE event;
- non-qualified SUPER_ADMIN uplines produced zero-value LOST events as required by the published policy;
- admin event/ledger/reconciliation API readbacks passed;
- USER commission history did not expose receiver/purchaser email fields;
- deterministic/idempotent processing is covered by automated tests.

The standalone Postman same-subscription retry request was not used as runtime
acceptance evidence because its Postman subscription-id variable was unresolved.
No false runtime idempotency claim is recorded from that request.

## Current ADMIN UI

Operational routes now include:

- Dashboard
- Users
- Roles & Permissions
- Packages
- Deposits
- Wallets & Ledger
- Subscriptions
- Referral Commissions
- Referrals
- Settings

The Referral Commissions workspace exposes:

- effective/published commission plan state;
- editable DRAFT level/policy configuration;
- publication safety and unsaved-change protection;
- reconciliation queue;
- immutable commission events.

## Current USER UI

Operational USER financial/referral surfaces include:

- Packages
- Deposits
- Wallet
- Referrals

`/user/referrals` now shows only settled ledger-backed Referral Commission as
earned money. No projected or fabricated commission is presented as a balance.

## Product Scope — LOCKED

FixTradeZone does not execute real trades and has no AI-agent/broker/exchange
execution milestone in v1.

Future trade-like presentation is limited to clearly labelled **Simulated Trade
Activity** / **SIMULATED RESULTS** and must not silently mutate real wallet/ledger
balances.

## Current V1 Sequence

1. COMM-01 referral commission foundation — locally accepted, PR handoff pending
2. rewards / caps / lifecycle accounting
3. Simulated Trade Activity display only
4. minimal v1 landing/template controls
5. remaining USER/ADMIN operational slices
6. notifications/reports required for launch
7. QA/security/release hardening
8. production deployment

## Infrastructure / Data Ownership

- MySQL is the relational/business/accounting source of truth.
- MongoDB is reserved for later document/CMS/flexible configuration only if a repository feature requires it.
- Redis is transient infrastructure and should only be used where an implemented feature requires it.

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
12. Commit/push the feature branch and open PR to `main` only after every local gate is GREEN.

Production deployment remains HOLD until required v1 milestones and release
hardening are complete.
