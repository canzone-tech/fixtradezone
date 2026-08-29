# SIM-01 implementation checkpoint — 2026-08-29

Status: SOURCE IMPLEMENTATION GREEN / LOCAL ACCEPTANCE PENDING

Branch: `feature/simulated-trade-activity`

## Source implementation completed

- Migration `0016_simulated_trade_activity` creates versioned simulated-activity policy and immutable simulated event tables.
- Seeded policy V1 starts `DRAFT`; migration alone cannot generate activity.
- Backend deterministic generator, worker, reconciliation, RBAC and USER read APIs are implemented.
- ADMIN and USER BFF/routes/workspaces are implemented.
- Worker defaults OFF and requires both `SIMULATED_ACTIVITY_WORKER_ENABLED=true` and Platform Operations `AUTOMATIC` mode.
- Event identity includes subscription, immutable policy version, local activity date and slot.
- Historical event timestamps retain the immutable policy timezone snapshot.
- Financial boundary remains `NONE`: no wallet, ledger, reward, cap, commission, deposit or subscription accounting mutation.
- Policy publication executes only on a safe local calendar-day boundary; no partial-day policy mixing or historical simulated backfill is allowed.

## Automated source gates

Admin CI #123 completed GREEN on the SIM-01 UI/BFF implementation: platform-time guard, lint, typecheck, Next build and critical dependency audit passed.

Backend CI #179 completed GREEN after the final type-safety repair: Prisma generate/validate, formatter, ESLint, 44/44 test suites, 244/244 tests, Nest build and critical dependency audit passed. The workflow then committed formatter/lint-only normalization to the feature branch.

Temporary repair workflows self-deleted. Only normal `admin-ci.yml` and `backend-ci.yml` remain.

## Local acceptance still required

Do not open a PR or deploy production yet. Required local gates are:

1. Back up the existing local `fixtradezone` database without resetting it.
2. Apply migration `0016_simulated_trade_activity` with `prisma migrate deploy` and verify migration status.
3. Keep both reward and simulated-activity infrastructure workers OFF during controlled manual acceptance unless a specific worker test is being performed.
4. Postman: verify DRAFT safety, SUPER_ADMIN policy management, RBAC, safe publication boundary, worker health, USER read boundary and idempotent reconciliation behavior.
5. Browser: verify ADMIN and USER workspaces, disclosure text, permission behavior and timezone rendering.
6. SQL/readback: verify immutable unique simulated events and confirm zero financial side effects.
7. Automatic worker acceptance is a separate controlled test after an effective published policy exists.
8. RWD-01 scheduled real reward settlement remains an independent production prerequisite and must not be altered by SIM-01 testing.
