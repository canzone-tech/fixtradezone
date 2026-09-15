# FixTradeZone — Current State

## Canonical Checkpoint — 2026-09-15

Repository state plus completed local runtime acceptance are the delivery authority.
Source code and CI alone are not treated as complete runtime acceptance.

## Active Development Branch

`feature/site-mode-control`

Accepted code checkpoint before this documentation refresh:

```text
62e098cb7384a7a543c409081d763dc6378cf139  fix(site-mode): satisfy admin hook lint gate
```

## Current Milestone — SITE-MODE-01

Status: **FUNCTIONALLY COMPLETE / LOCAL POSTMAN GREEN / BROWSER GREEN / FINAL LOCAL GATES GREEN / DOCUMENTATION CLOSEOUT IN PROGRESS**.

Canonical feature documentation:

- `docs/SITE-MODE-CONTROL.md`

SITE-MODE-01 establishes one authoritative Platform Mode control with three locked
states:

- `LIVE` -> public application available, registration enabled, public login
  policy, `AUTOMATIC` operations;
- `TESTING` -> Coming Soon, registration disabled, approved ACTIVE testers plus
  `SUPER_ADMIN`, `CONTROLLED_MANUAL` operations;
- `MAINTENANCE` -> Maintenance page, registration disabled, `SUPER_ADMIN` only,
  `CONTROLLED_MANUAL` operations.

Platform Mode is the authority for the master operations profile. The old
independent operations mutation is intentionally rejected so it cannot contradict
Site Mode.

Mode transitions also synchronize deposit posting behavior:

- `AUTOMATIC` -> `AUTO_ON_APPROVAL`;
- `CONTROLLED_MANUAL` -> `MANUAL_RECONCILIATION`.

Emergency recovery is LIVE-only, `SUPER_ADMIN`-only, audited and time-bounded to
5–60 minutes. Ordinary manual recovery remains locked while LIVE unless that
explicit recovery window is active.

Migration `0044_site_mode_control` is applied in local MySQL. The database contains
44 Prisma migrations and reports the schema as up to date.

## Accepted SITE-MODE-01 Runtime Evidence

Backend API/Postman acceptance was completed before frontend browser acceptance and
must not be repeated unless a later failure requires a targeted diagnostic test.

Browser acceptance is GREEN for:

- TESTING public Coming Soon behavior;
- registration blocking outside LIVE;
- TESTING login/banner behavior;
- normal-user denial before tester approval;
- tester add -> USER access -> tester removal -> denial flow;
- tester count restored to `0`;
- MAINTENANCE public page and `SUPER_ADMIN`-only access;
- LIVE public application and registration restoration;
- normal USER access in LIVE;
- LIVE emergency recovery unlock and explicit lock;
- cross-device local-network verification.

Final accepted runtime state:

```text
siteMode: LIVE
operationsMode: AUTOMATIC
recoveryActive: false
testerCount: 0
```

## Final Local Automated Gates

At code checkpoint `62e098cb7384a7a543c409081d763dc6378cf139`:

```text
Prisma migrations: 44
Database schema: up to date
Admin platform-time verification: GREEN
Admin lint: GREEN
Admin typecheck: GREEN
Admin production build: GREEN
```

UTC remains the locked platform standard.

## Closeout Gate Before PR to `main`

1. commit this documentation checkpoint to `feature/site-mode-control`;
2. review repository CI/check behavior for the documentation head (docs-only
   changes may legitimately skip path-filtered Admin/Backend CI);
3. pull the documentation head locally with fast-forward only;
4. confirm branch/HEAD/status;
5. keep `backups/` untouched and untracked;
6. keep `postman/__pycache__/` untouched and untracked;
7. do not repeat already accepted SITE-MODE-01 Postman/browser tests;
8. open the PR to `main` only after the final local checkpoint remains clean.

No new feature work starts before this closeout/PR checkpoint is complete.

## Permanent Delivery Locks

- MySQL is the relational/business/accounting source of truth.
- Never introduce MongoDB into FixTradeZone.
- Never use `prisma migrate dev` for project delivery.
- Never reset the database.
- Forward migrations only with `prisma migrate deploy` when a reviewed migration
  is actually required.
- `backups/` must never be touched, added, deleted or stashed.
- `postman/__pycache__/` must never be touched, added, deleted or stashed.
- Never touch/pop/drop local stashes without explicit approval.
- Backend remains authoritative for security, financial and business rules;
  frontend behavior mirrors those rules for UX but cannot replace server
  enforcement.
- Complete one module/API at a time.
- Repo-first implementation remains locked: feature-branch change -> repository
  CI/checks -> local fast-forward pull -> local Postman/API acceptance when needed
  -> browser acceptance -> financial SQL/ledger/readback proof when needed -> PR.
- PR to `main` only after every required local acceptance gate is GREEN.
- Do not repeat completed modules/tests unless a new failure requires a targeted
  retest.

## Product Scope — LOCKED

FixTradeZone does not execute real trades in v1. Any trade-like presentation is
limited to explicitly labelled simulated activity and must not silently mutate
real wallet/ledger balances.

Production/live release remains the current priority, subject to the locked local
acceptance and PR gates above.
