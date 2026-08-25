# FixTradeZone PKG-01 Local Verification

**Status:** REQUIRED BEFORE BFF/UI WORK

**Branch:** `feature/packages-foundation`

**Migration:** `0007_package_plan_foundation`

This gate verifies the package-plan backend against the single local
`fixtradezone` MySQL database. Do not run the PKG-01 Postman collection against
staging or production.

## 1. Pull and inspect the checkpoint

```bash
cd ~/FixTradeZone
git fetch prashant
git switch feature/packages-foundation
git pull --ff-only prashant feature/packages-foundation
git status --short --branch
git log -5 --oneline --decorate
```

The working tree must be clean before local acceptance.

## 2. Pre-deploy code gate

```bash
npm run verify:local
npm run db:status
```

Expected before deployment:
- code gate GREEN;
- seven source migrations detected;
- `0007_package_plan_foundation` pending locally.

## 3. Review and deploy the migration

Take the established local MySQL backup before the write operation. Then run:

```bash
npm run db:deploy
npm run verify:milestone
```

Do not use `prisma migrate dev`, create a shadow database, reset the application
database, or mark a failed migration applied.

## 4. Start the API and obtain a SUPER_ADMIN token

```bash
cd ~/FixTradeZone/backend
npm run start:dev
```

In Postman:
1. select the local environment;
2. log in through the current MASTER collection as the Founder SUPER_ADMIN;
3. confirm `accessToken` contains the current access JWT;
4. do not paste tokens into source files, screenshots, logs or chat.

## 5. Run the PKG-01 collection once, in order

Import:
- `postman/FixTradeZone-PKG-01.postman_collection.json`
- `postman/FixTradeZone.local.postman_environment.json` if its new package
  variables are not already present in the current local environment.

Run the complete **FixTradeZone PKG-01 API Gate** collection in order.

Expected result: all 13 requests/tests GREEN.

The run proves:
- unpublished draft terms never leak to USER;
- migration V1 contains all nine approved items;
- financial/rate values are exact JSON strings;
- audited plan and item writes increment the aggregate revision;
- a stale revision fails with 409 and does not mutate state;
- duplicate package identities fail with 409;
- SUPER_ADMIN publishes the whole V1 plan atomically;
- USER sees exactly one effective published catalogue while activation remains
  unavailable;
- published item mutation fails with 409;
- a correction workflow clones V1 into the sole V2 draft.

The collection intentionally leaves:
- V1 `PUBLISHED` with nine items;
- V2 `DRAFT` at revision 1 with nine cloned items.

Do not blindly rerun the full collection after publication. Resume from the
failed request or inspect state first.

## 6. SQL readback

Run these read-only checks in the local `fixtradezone` database:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name = '0007_package_plan_foundation';

SELECT status, COUNT(*) AS planCount
FROM package_plan_versions
GROUP BY status
ORDER BY status;

SELECT pv.versionNumber, pv.status, pv.revision,
       pv.effectiveFrom, pv.effectiveTo, COUNT(pi.id) AS itemCount
FROM package_plan_versions pv
LEFT JOIN package_plan_items pi ON pi.planVersionId = pv.id
GROUP BY pv.id, pv.versionNumber, pv.status, pv.revision,
         pv.effectiveFrom, pv.effectiveTo
ORDER BY pv.versionNumber;

SELECT pd.code, pi.displayName, pi.price, pi.currency,
       pi.minimumRewardRate, pi.maximumRewardRate,
       pi.capMultiplier, pi.goalDays, pi.cycleDays
FROM package_plan_items pi
JOIN package_definitions pd ON pd.id = pi.packageDefinitionId
JOIN package_plan_versions pv ON pv.id = pi.planVersionId
WHERE pv.versionNumber = 1
ORDER BY pi.sortOrder;

SELECT action, entityType,
       JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.operation')) AS operation,
       createdAt
FROM audit_logs
WHERE entityType IN ('PackagePlanVersion', 'PackagePlanItem')
ORDER BY createdAt, id;
```

Expected:
- migration finished and not rolled back;
- one published plan and one draft after the full Postman run;
- nine items in each plan;
- V1 item terms match the Founder-approved catalogue;
- audited `UPDATE`, `APPROVE/PUBLISH`, and `CLONE_DRAFT` operations exist.

## 7. Final gate and handoff

```bash
cd ~/FixTradeZone
npm run verify:milestone
git status --short --branch
```

Share:
- milestone verification summary;
- Postman runner pass/fail totals;
- the four SQL result sets above;
- any error response body if a request failed, with tokens/secrets removed.

BFF and UI implementation begins only after this local backend/API gate is
accepted.
