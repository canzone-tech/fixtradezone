# FixTradeZone — Current State

## Canonical Checkpoint — 2026-09-15

Repository state plus completed local/runtime acceptance are the delivery
authority. Source code and CI alone are not treated as complete runtime
acceptance.

## Mainline Checkpoint

`main` contains the merged SITE-MODE-01 milestone through PR #20.

Accepted main checkpoint before starting PROD-01:

```text
3bc1233f443ae459e8002e93a36a4631186a6cf4  Merge pull request #20 — SITE-MODE-01
```

SITE-MODE-01 is closed and merged. Its accepted final runtime state was:

```text
siteMode: LIVE
operationsMode: AUTOMATIC
recoveryActive: false
testerCount: 0
```

Passed SITE-MODE Postman/browser acceptance must not be repeated unless a later
failure requires a targeted diagnostic retest.

## Active Development Branch

`feature/production-cutover-readiness`

## Current Milestone — PROD-01 Production Cutover Readiness

Status: **STARTED — REPO/RELEASE DISCOVERY ONLY**.

Canonical milestone documentation:

- `docs/PRODUCTION-CUTOVER.md`
- `docs/SITE-MODE-CONTROL.md`

PROD-01 prepares the first production deployment without importing local/QA
acceptance data into production and without weakening the locked database,
security, accounting, or Site Mode architecture.

### Production database decision — LOCKED

- Keep the accepted local/QA MySQL database intact as test/acceptance evidence.
- Production uses a separate, fresh MySQL database.
- Do not copy local synthetic/test business or financial rows into production.
- Apply production schema only through repository forward migrations with
  `prisma migrate deploy`.
- Never use `prisma migrate dev` or `prisma migrate reset`.
- Never blank/reset a populated live production database after go-live.
- After LIVE, preserve production history and use audited/forward-only changes.

### First go-live order — LOCKED

1. complete repo/release discovery;
2. provision production infrastructure and secrets;
3. provision fresh production MySQL;
4. deploy accepted `main` code;
5. apply and verify migrations;
6. perform minimum reviewed production bootstrap;
7. start public state in `MAINTENANCE` or controlled `TESTING`;
8. run production smoke/readback checks;
9. verify tester/recovery baseline;
10. switch Platform Mode to `LIVE` only as the final release action.

No production infrastructure/database mutation is authorized during the current
repo/discovery phase.

## Current Database / Delivery Facts

- MySQL is the single relational/business/accounting source of truth.
- Local accepted schema currently contains 44 Prisma migrations and is up to
  date.
- Applied migrations are immutable; corrections are forward-only.
- Financial/accounting historical facts are never silently rewritten/deleted.
- UTC remains the locked platform-time standard.
- FixTradeZone does not use MongoDB.

## Permanent Delivery Locks

- Repo + `/docs` are the permanent source of truth.
- Never introduce MongoDB into FixTradeZone.
- Never use `prisma migrate dev` for delivery.
- Never reset the application database to bypass a migration/deployment problem.
- Forward migrations only with `prisma migrate deploy` when a reviewed migration
  is actually required.
- `backups/` must never be touched, added, deleted or stashed.
- `postman/__pycache__/` must never be touched, added, deleted or stashed.
- Never touch/pop/drop local stashes without explicit approval.
- Backend remains authoritative for security, financial and business rules;
  frontend behavior mirrors those rules for UX but cannot replace server
  enforcement.
- Complete one module/stage at a time.
- Repo-first implementation remains locked: feature-branch change -> repository
  CI/checks -> local fast-forward pull -> local Postman/API acceptance when
  needed -> browser acceptance -> financial SQL/ledger/readback proof when
  needed -> PR.
- Production cutover also proceeds one stage at a time with readback before the
  next stage.
- Do not repeat completed modules/tests unless a new failure requires a targeted
  retest.

## Product Scope — LOCKED

FixTradeZone does not execute real trades in v1. Any trade-like presentation is
limited to explicitly labelled simulated activity and must not silently mutate
real wallet/ledger balances.

Production/live release is the current priority. The first production cutover
remains HOLD until PROD-01 discovery, infrastructure, migration, bootstrap and
controlled smoke gates are explicitly completed.
