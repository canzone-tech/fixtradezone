# FixTradeZone Local Verification Standard

This workflow is LOCKED for local development and milestone delivery.

## Principles
- Verification commands are read-only with respect to source files and database state.
- Formatting, Prisma client generation, and migration deployment are explicit write operations and never run implicitly inside verification.
- Generated Prisma client files are excluded from project formatting checks.
- Backend and admin applications have independent gates, plus a root project gate.
- Postman/manual API verification remains mandatory for changed API modules before PR/main.

## Root commands
Run from `~/FixTradeZone`.

### Normal local code gate
```bash
npm run verify:local
```
Runs:
- backend Prisma schema validation
- backend formatting check
- backend ESLint
- backend Jest tests in-band
- backend build
- admin ESLint
- admin TypeScript no-emit typecheck
- admin production build
- unstaged and staged `git diff --check`

### Milestone gate
```bash
npm run verify:milestone
```
Runs the full local code gate plus backend Prisma migration status. Use this before Postman milestone sign-off and before PR preparation.

### Database status
```bash
npm run db:status
```
Read-only. Confirms migration state.

### Database deployment
```bash
npm run db:deploy
```
Write operation. Run only when an reviewed migration must be applied locally.

## Explicit write commands
These are never part of verification:
- `npm --prefix backend run format`
- `npm --prefix backend run lint:fix`
- `npm --prefix backend run prisma:generate`
- `npm run db:deploy`
- `prisma format`

## Delivery order
1. Implement one focused module/API slice.
2. Run the relevant module gate during development.
3. Run `npm run verify:local` from the repository root.
4. If the slice includes a migration, apply it explicitly and run `npm run verify:milestone`.
5. Verify changed APIs locally in Postman.
6. Update persistent docs/current state.
7. Open PR to `main` only after all local gates are green.

## Failure handling
- Stop at the first failing gate.
- Fix the actual failing layer; do not bypass or disable the check.
- Do not run formatting over generated Prisma files.
- Do not mark failed migrations applied unless the database was actually repaired and verified.
- Do not reset the FixTradeZone application database as a routine recovery mechanism.
