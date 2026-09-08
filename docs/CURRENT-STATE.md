# FixTradeZone — Current State

## Canonical Checkpoint — 2026-09-08

Repository state plus completed local verification are the acceptance authority.
Source code and CI alone are never treated as financial runtime acceptance.

## Active Development Branch

`feature/v1-closeout-release-gaps`

Current accepted remote checkpoint before this documentation refresh:

```text
466728e  fix(admin): keep idle lock full viewport
```

## Module 08 — Deposits / Maker-Checker

Status: **FUNCTIONALLY COMPLETE / LOCAL ACCEPTANCE GREEN / CLOSEOUT IN PROGRESS**.

The deposits slice remains a backend + frontend vertical slice and preserves the
existing maker-checker architecture.

Accepted behavior includes:

- USER deposit creation through the published package/payment-rail contract;
- ADMIN review stage before final approval;
- SUPER_ADMIN final approval authority;
- audited rejection through the normal lifecycle;
- accounting posting and downstream package activation on approved funding;
- referral-commission and internal-trading lifecycle integration already present
  in the accepted financial path;
- bulk approve/reject acceptance reported GREEN locally;
- USER approved/rejected deposit readback and browser acceptance reported GREEN.

### Same-package ACTIVE funding protection

A USER who already has an `ACTIVE` subscription for a package cannot create a
new funding/deposit request for that same package until the subscription leaves
`ACTIVE`.

The rule is keyed by package-definition identity, not merely one plan item, so a
different plan item for the same package cannot bypass the protection.

Different packages remain eligible under the existing multiple-active-package
policy when all other deposit rules allow them.

The backend remains authoritative and returns a conflict for direct API bypass.
The effective USER package catalogue also removes package definitions that are
already ACTIVE for the current USER, so the normal `/user/packages` and
`/user/deposits` UI paths do not offer duplicate same-package funding.

This protection required no Prisma schema or migration change and does not
mutate published Package V1 terms.

### Frontend/session-lock closeout fix

The shared inactivity lock used by ADMIN and USER surfaces is required to cover
the complete application viewport.

A global responsive rule previously constrained generic `[role="dialog"]`
elements and could visually clamp the full-screen idle-lock backdrop. The shared
lock stylesheet now explicitly preserves unrestricted full-viewport dimensions.

Local browser acceptance for the corrected session lock and deposits UI was
reported GREEN on 2026-09-08. Admin CI for the lock change passed lint,
typecheck, production build and critical dependency audit.

### Latest verified automated gates

Backend local verification before the frontend-only lock change:

```text
Test Suites: 65 passed, 65 total
Tests:       338 passed, 338 total
Nest build:  GREEN
```

The subsequent session-lock change touched only ADMIN CSS. Its Admin CI run was
GREEN for lint, typecheck, build and critical dependency audit, and the updated
frontend was then accepted locally.

## Module 08 Closeout Gate

Before opening the PR to `main`:

1. keep `backups/` untouched and untracked;
2. keep `postman/__pycache__/` untouched and untracked;
3. confirm final branch/HEAD/status after this documentation commit is pulled;
4. confirm repository CI for the documentation head is not hiding any code
   regression (path-filtered workflows may legitimately not run for docs-only
   changes);
5. perform no additional Module 08 code changes unless a new acceptance failure
   is found;
6. open the PR to `main` only after the final local checkpoint remains clean.

No next module starts before this closeout/PR checkpoint is complete.

## Permanent Delivery Locks

- MySQL is the relational/business/accounting source of truth.
- Never use `prisma migrate dev` for project delivery.
- Never reset the database.
- Forward migrations only with `prisma migrate deploy` when a reviewed migration
  is actually required.
- Run Prisma commands from `backend` with `npx --no-install prisma`.
- `backups/` must never be touched, added or deleted by delivery automation.
- `postman/__pycache__/` must never be touched, added or deleted.
- Never touch/pop/drop local stashes without explicit approval.
- Package V1 published commercial terms are immutable once published.
- Backend is authoritative for financial/business rules; frontend mirrors those
  rules for UX but cannot replace server enforcement.
- Complete one module/API at a time.
- Repo-first implementation is the current working pattern: update the feature
  branch, verify available repository CI, then pull locally for runtime/browser/
  Postman acceptance.
- PR to `main` only after every required local acceptance gate is GREEN.

## Product Scope — LOCKED

FixTradeZone does not execute real trades in v1. Any trade-like presentation is
limited to explicitly labelled simulated activity and must not silently mutate
real wallet/ledger balances.

Production deployment remains HOLD until the remaining v1 milestones and final
release hardening are complete.
