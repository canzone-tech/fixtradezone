# FixTradeZone — Current State

## Canonical Checkpoint — 2026-08-27

Repository state plus completed local verification are the acceptance authority.

## Active Development Branch

`feature/package-subscription-activation`

## Mainline Baseline

The reusable platform foundation, authentication/RBAC, configurable auth/registration, user/admin shell, referral foundation, package-plan foundation, deposit foundation and immutable wallet/ledger foundation are established before SUB-02.

Applied migration history must never be rewritten. MySQL remains the relational/business/accounting source of truth.

## SUB-02 — Package Subscription / Activation

Status: **COMPLETE / LOCALLY ACCEPTED / PR HANDOFF PENDING**.

Canonical contract:

`docs/PACKAGE-SUBSCRIPTION-ACTIVATION.md`

SUB-02 integrates package funding, approved-deposit accounting and immutable package-subscription activation across backend, ADMIN UI and USER UI.

### Supported activation behavior

Deposit-funded execution currently supports:

- `PAYMENT_APPROVED`
  - approval occurs first;
  - approved-deposit accounting must exist;
  - activation completes automatically after accounting.
- `MANUAL_ACTIVATION`
  - approval/accounting complete first;
  - deposit remains Activation Pending;
  - authorized ADMIN/SUPER_ADMIN explicitly completes activation.

Configured but unimplemented execution engines such as `PAYMENT_SUBMITTED` and `RULE_BASED` fail closed for new package funding.

### Accounting policy remains independent

Global accounting modes:

- `AUTO_ON_APPROVAL`
- `MANUAL_RECONCILIATION`

Package activation never bypasses approved-deposit accounting.

Manual accounting recovery remains available through the authorized ledger-post path.

### Multiple-active packages

`MULTIPLE_ACTIVE` is operational.

Local acceptance proved one USER retaining multiple simultaneous ACTIVE packages while each activation preserves its own immutable source-plan snapshot.

Verified historical coexistence includes:

- `SINGLE_ACTIVE / PAYMENT_APPROVED`;
- `MULTIPLE_ACTIVE / PAYMENT_APPROVED`;
- `MULTIPLE_ACTIVE / MANUAL_ACTIVATION`.

Effective-plan changes never rewrite an existing subscription snapshot.

### Financial / idempotency invariants

Package activation:

- requires an APPROVED source deposit;
- requires its approved-deposit accounting transaction;
- consumes exact package principal through a balanced immutable ledger transaction;
- commits funding + subscription creation transactionally;
- is idempotent by source deposit;
- cannot double-consume Main / Deposit balance;
- cannot create a duplicate subscription on manual retry;
- records immutable source/commercial snapshots and audit evidence.

Local Postman retry verification returned `created: false` and the original subscription identity for an already-activated MANUAL deposit.

### SUB-02 ADMIN UI

- Package plan workspace distinguishes AUTO vs MANUAL activation.
- Accounting configuration explicitly remains independent from activation policy.
- Deposits expose accounting recovery only when appropriate.
- Subscriptions expose Activation Pending and authorized manual activation.
- Pending rows retain source-plan mode/trigger context.
- Package-plan publication is blocked while lifecycle/item edits remain unsaved.
- Success/error/unsaved feedback remains viewport-visible on the long package-plan workspace.
- Deposits and Subscriptions have explicit topbar route headings.

### SUB-02 USER UI

- Effective package mode/activation policy is displayed.
- Unsupported activation engines cannot begin new funding.
- Package cards explain AUTO vs MANUAL behavior.
- Multiple simultaneous ACTIVE subscriptions are shown independently.
- Historical subscriptions retain immutable activation-policy snapshots.

## Local Acceptance — GREEN

Completed on the feature branch:

- backend focused/unit regression coverage;
- Prisma validation and migration status;
- backend formatting and ESLint;
- NestJS production build;
- admin lint/typecheck/Next.js production build;
- combined browser/UI runtime verification;
- Postman/API runtime verification;
- AUTO `PAYMENT_APPROVED` activation;
- `MULTIPLE_ACTIVE` simultaneous activation;
- authorized `MANUAL_ACTIVATION`;
- activation pending before manual completion;
- pending-queue removal after manual completion;
- immutable historical subscription snapshots;
- duplicate manual activation idempotency;
- root `npm run verify:milestone`;
- unstaged and staged diff checks.

No SUB-02 merge to `main` until the complete feature diff is reviewed and the PR is approved.

## Product Scope — LOCKED

FixTradeZone does not execute real trades and has no AI-agent/broker/exchange execution milestone in v1.

Future trade-like presentation is limited to clearly labelled **Simulated Trade Activity** / **SIMULATED RESULTS** and must not silently mutate real wallet/ledger balances.

## Current V1 Sequence

1. SUB-02 package subscription / activation — locally accepted, PR handoff pending
2. Referral commissions on legitimate package/payment events
3. Rewards / caps / lifecycle accounting
4. Simulated Trade Activity display only
5. Minimal v1 landing/template controls
6. Remaining USER/ADMIN operational slices
7. Notifications/reports required for launch
8. QA/security/release hardening
9. Production deployment

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

Production deployment remains HOLD until required v1 milestones and release hardening are complete.
