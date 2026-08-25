# FixTradeZone PKG-01 Local Verification

**Status:** DATABASE DEPLOYED; COMBINED API/SQL/BROWSER ACCEPTANCE REQUIRED

**Branch:** `feature/packages-foundation`

**Migration:** `0007_package_plan_foundation`

This gate verifies the complete package-plan slice against the single local
`fixtradezone` MySQL database. The Founder authorized BFF/UI implementation
while manual tests are batched here. Do not run the PKG-01 Postman collection
against staging or production.

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
- or the current MASTER collection
  `postman/FixTradeZone-Local-API-MASTER-v13-PKG-01-FINAL-v2-ENV.postman_collection.json`
  when retaining the working v12 environment variables;
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

### Current corrective resume checkpoint

The first local run successfully applied request 04 and then request 05 failed
before mutating its item or revision. That failure exposed the transformed-DTO
omitted-rate bug, which is corrected with regression tests.

After pulling the corrective backend commit and restarting NestJS:

1. run the PKG-01 SUPER_ADMIN login request;
2. rerun requests 02 and 03 to refresh `packagePlanVersionId`,
   `packageItemId` and `packageRevision` from the database;
3. resume at request 05;
4. do **not** rerun request 04 or the complete folder from the beginning.

The v13 MASTER request-05 test script does not overwrite environment revision
state when the HTTP request fails.

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

## 7. Integrated browser acceptance

Run the admin and USER applications against the same local API/database.

ADMIN/SUPER_ADMIN `/packages`:

- session resolves before package calls;
- V1/V2 version history and exact nine-item readback load;
- `packages.read` controls navigation/read access for delegated ADMIN;
- `packages.draft.manage` controls draft settings/item edits;
- publication and published-plan closure remain SUPER_ADMIN only;
- stale revision returns 409, reloads current plan data, and never silently
  overwrites another mutation;
- published items remain read-only and cloning is the correction path.

USER `/user/packages`:

- before an effective publication, the explicit safe empty state renders;
- after publication, only the effective plan and non-hidden items render;
- price/rate/cap values match the exact API response;
- `CLOSED_TO_NEW_ACTIVATIONS` remains visible with its status;
- no purchase or activation action appears and the deferred boundary is clear.

Check a narrow/mobile viewport for both routes and confirm the locked Dark Neo
shell remains usable.

## 8. Final gate and handoff

```bash
cd ~/FixTradeZone
npm run verify:milestone
git status --short --branch
```

Share:

- milestone verification summary;
- Postman runner pass/fail totals;
- the four SQL result sets above;
- ADMIN and USER browser acceptance results;
- any error response body if a request failed, with tokens/secrets removed.

Push/PR preparation begins only after this combined gate is accepted.
