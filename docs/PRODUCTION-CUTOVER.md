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

## Client Production Server Source Protection — LOCKED

The production host is client-owned. Original FixTradeZone application source code
must not be left on that host.

Production delivery therefore uses release artifacts produced by repository CI from
an accepted commit. The running server must not contain a FixTradeZone Git checkout
or application source tree.

Allowed persistent runtime material includes:

- compiled NestJS backend output and required production runtime dependencies;
- Next.js standalone production output, static assets, and public assets;
- release metadata/checksums;
- server-side environment/secrets with restrictive ownership and permissions;
- operational configuration required to run the accepted release.

The production runtime package must not intentionally contain:

- `.git/` or repository history;
- FixTradeZone `src/` application source directories;
- original `.ts` / `.tsx` application source files;
- tests, development-only project files, or local developer certificates;
- application source maps.

Frontend JavaScript/assets necessarily delivered to browsers are production build
outputs, not a repository source checkout.

Database migrations are deployment artifacts, not application runtime source. Any
minimum migration bundle required for `prisma migrate deploy` is transferred only
for the migration gate and removed from the running release after migration/readback
is complete. Do not deploy the full repository merely to run migrations.

## Go-Live Order — LOCKED

The first production boot must not expose the public application as LIVE before
production smoke verification is complete.

Required order:

1. provision production infrastructure and secrets;
2. provision a fresh production MySQL database;
3. produce release artifacts from accepted `main` in repository CI;
4. deploy only verified release artifacts to the client production server;
5. apply reviewed migrations with `prisma migrate deploy`;
6. verify migration/readback state;
7. complete required founder/SUPER_ADMIN and system bootstrap;
8. verify required production configuration and published policies;
9. start the platform in `MAINTENANCE` or controlled `TESTING` mode;
10. perform production smoke checks and targeted readback;
11. verify final recovery/tester baseline;
12. switch Platform Mode to `LIVE` as the final release action.

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

Production topology currently targeted:

```text
fixtradezone.com      -> Apache -> Next.js standalone on 127.0.0.1:3101
api.fixtradezone.com  -> Apache -> NestJS backend on 127.0.0.1:3100
MySQL                 -> 127.0.0.1:3306
Redis                 -> private/local endpoint after final Redis gate
```

The Admin production runtime must explicitly provide:

\`\`\`text
API_BASE_URL=http://127.0.0.1:3100
\`\`\`

Production Admin must fail closed when \`API_BASE_URL\` is missing rather than
silently falling back to the local-development backend port. The development
fallback remains \`http://127.0.0.1:3000\`.

The public Apache vhosts currently serve bootstrap/launch-preparation content only;
they must not proxy to the application until the controlled application gate is
explicitly opened.

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

For production delivery specifically:

1. build and verify on GitHub/CI;
2. verify the exact release commit and SHA-256 checksum;
3. transfer only release artifacts to the client server;
4. never clone the FixTradeZone source repository onto the client server.

## Protected Local Paths

Never touch/add/delete/stash:

```text
backups/
postman/__pycache__/
```

Never touch local stashes without explicit approval.

## Current PROD-01 Status

Status: **IN PROGRESS — INFRASTRUCTURE + SOURCE-FREE RELEASE PACKAGING**.

Completed/verified production readiness items:

- `fixtradezone.com` and `api.fixtradezone.com` resolve to the intended production
  server;
- Apache HTTP vhosts and valid Let's Encrypt TLS certificates are active for both
  hostnames;
- public hostnames still serve bootstrap content rather than the application;
- Ubuntu/Node/npm/PM2/MySQL runtime baseline has been inventoried;
- fresh production MySQL database `fixtradezone` and dedicated local application
  user have been created and login-readback verified;
- no local/QA application data was imported;
- an accidental temporary Git source checkout on the client server was removed;
- client-server source-code prohibition is now explicit and locked;
- source-free backend/admin runtime artifact CI packaging is being established on
  `feature/production-cutover-readiness`.

Still HOLD before application deployment:

- release artifact CI must be GREEN and locally inspected;
- Redis ownership/configuration must be finalized without introducing MongoDB;
- no production migrations have been applied yet;
- no application runtime has been deployed or started yet;
- Apache is not yet proxying production traffic to Next.js/NestJS;
- founder/SUPER_ADMIN production bootstrap has not been performed;
- LIVE/AUTOMATIC transition is not authorized yet.

The existing Docker `fixtradezone-mongo` container is not part of the locked
FixTradeZone MySQL architecture and must not be used by the production application.
It remains untouched pending a separate safe cleanup decision.
