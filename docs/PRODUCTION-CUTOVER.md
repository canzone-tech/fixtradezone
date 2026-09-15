# FixTradeZone — Production Cutover Readiness (PROD-01)

## Purpose

PROD-01 prepares FixTradeZone for the first production deployment without
mixing accepted local/QA data into production and without weakening the existing
database, accounting, security, or Site Mode locks.

This milestone is a release/cutover milestone. It does not authorize new product
scope or changes to locked business rules.

## Production Database Rule — LOCKED

Production must start from a separate, clean MySQL database created specifically
for the production environment.

The accepted local/QA database is evidence and must not be blanked, reset, copied
wholesale into production, or repurposed as the production database.

A clean production database means:

- empty application schema before deployment;
- repository migrations applied forward-only with `prisma migrate deploy`;
- required bootstrap/system configuration created through reviewed project paths;
- required production founder/SUPER_ADMIN bootstrap completed through the existing
  audited mechanism;
- only reviewed production configuration/published policies are introduced;
- no local test users, dummy deposits, payouts, trade/simulated events, tester
  allowlist rows, synthetic ledger entries, or other local acceptance data are
  copied into production.

A clean production database does **not** mean dropping/resetting a populated live
production database. After go-live, production business/accounting history is
preserved and all changes remain forward-only and audited.

The following remain prohibited:

- `prisma migrate dev`;
- `prisma migrate reset`;
- destructive schema/database resets as a deployment shortcut;
- rewriting applied migrations;
- deleting or rewriting immutable financial/business history.

## Go-Live Order — LOCKED

The first production boot must not expose the public application as LIVE before
production smoke verification is complete.

Required order:

1. provision production infrastructure and secrets;
2. provision a fresh production MySQL database;
3. deploy application code from accepted `main`;
4. apply reviewed migrations with `prisma migrate deploy`;
5. verify migration/readback state;
6. complete required founder/SUPER_ADMIN and system bootstrap;
7. verify required production configuration and published policies;
8. start the platform in `MAINTENANCE` or controlled `TESTING` mode;
9. perform production smoke checks and targeted readback;
10. verify final recovery/tester baseline;
11. switch Platform Mode to `LIVE` as the final release action.

Expected final public operating state:

```text
siteMode: LIVE
operationsMode: AUTOMATIC
recoveryActive: false
testerCount: 0
```

After the production LIVE transition there is no database blanking/reset step.

## Phase A — Repo / Release Discovery

Before touching production infrastructure:

- confirm `main` HEAD and clean local sync;
- inventory production-required environment variables and secrets without
  exposing secret values;
- inventory backend/admin build/start commands;
- inventory health/readiness endpoints and worker/process entry points;
- inventory migrations and bootstrap commands;
- identify any local-only development assumptions (HTTPS dev certs, localhost
  origins, local Redis/MySQL addresses, debug flags, etc.);
- identify production web/reverse-proxy requirements;
- record the exact production deployment topology before implementation.

No production server/database mutation is allowed during this discovery phase.

## Phase B — Infrastructure Readiness

Confirm or provision, as applicable:

- Linux host/runtime baseline;
- Node.js/npm versions compatible with repository CI;
- MySQL 8.x production instance;
- Redis where required by current application runtime;
- reverse proxy and TLS certificates;
- production frontend/admin hostname(s);
- backend API hostname;
- process supervision/service startup;
- firewall rules limited to required public/internal ports;
- backup/restore capability before application data is accepted.

Secrets remain environment/secret-manager values and must never be committed to
Git or stored in business tables.

## Phase C — Fresh Production Database

Before migration deployment:

- confirm the target is the new production database, not local/QA;
- take/verify any infrastructure-level initial backup/snapshot if applicable;
- confirm database credentials have the minimum permissions required by the
  application and migration process;
- run read-only migration status first;
- apply repository migrations only with `prisma migrate deploy`;
- rerun migration status and verify the complete migration chain;
- perform targeted SQL/readback for critical bootstrap tables/configuration.

The local accepted database remains untouched.

## Phase D — Production Bootstrap

Bootstrap only the minimum required production state using existing reviewed
project mechanisms. This includes founder/SUPER_ADMIN access and required system
configuration.

Production bootstrap must not import local acceptance identities or synthetic
financial data.

Published commercial/policy configuration must be explicitly reviewed before it
is recreated or promoted in production. Historical local rows are not production
seed data merely because they were useful during acceptance.

## Phase E — Controlled Smoke Acceptance

Keep the platform non-public (`MAINTENANCE` or controlled `TESTING`) while
performing release smoke checks.

At minimum verify:

- backend health and database connectivity;
- Redis/runtime dependencies where used;
- SUPER_ADMIN authentication;
- Platform Mode readback;
- public Site Mode behavior;
- registration policy state;
- essential admin navigation/BFF connectivity;
- required worker/background-service state;
- email/SMTP connectivity where production configuration is available;
- audit logging for critical administrative actions.

Financial modules must use targeted readback/ledger proof if any real production
money-path smoke action is explicitly authorized. Do not manufacture production
financial history merely to satisfy a generic smoke checklist.

## Phase F — Final LIVE Gate

Before LIVE:

- all required CI/release checks GREEN;
- migration status up to date;
- production secrets/config reviewed;
- production smoke checks GREEN;
- tester list intentionally empty unless Founder explicitly approves retained
  production testers;
- emergency recovery locked;
- no known release blocker remains;
- rollback/recovery path understood.

Then perform the final Platform Mode transition to `LIVE`.

## Rollback Principle

Application rollback must never imply destructive database rollback.

If a release issue occurs after migrations are applied, prefer:

- Platform Mode -> `MAINTENANCE`;
- stop/pause affected application workers where operationally required;
- roll application code forward/fix or back to a schema-compatible build;
- use reviewed forward database corrections when necessary.

Never erase live accounting/business history to simulate a rollback.

## Delivery Workflow

PROD-01 continues the locked FixTradeZone workflow:

1. repo/docs discovery first;
2. feature branch changes first in repository;
3. repository CI/checks;
4. local fast-forward pull;
5. local verification for changed code;
6. production actions only after explicit gate/approval;
7. one production stage at a time with readback before moving on;
8. PR to `main` only after required local gates are GREEN.

## Protected Local Paths

Never touch/add/delete/stash:

```text
backups/
postman/__pycache__/
```

Never touch local stashes without explicit approval.

## Current PROD-01 Status

Status: **STARTED — REPO/RELEASE DISCOVERY ONLY**.

No production server, production database, DNS, TLS, process, or live customer
data mutation has been performed by this milestone yet.
