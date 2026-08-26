# FixTradeZone — Database Standards & Current State

## Single Application Database

- Host: 127.0.0.1
- Port: 3306
- Database: `fixtradezone`
- MySQL: 8.0.46
- Runtime user: `fixtradezone`

Do not create additional application databases unless explicitly approved.

## Prisma

- Prisma: 7.9.1
- Generator: `prisma-client`
- Output: `src/generated/prisma`
- moduleFormat: `cjs`
- Datasource provider: MySQL
- URL configured via `prisma.config.ts`
- Runtime connectivity uses `@prisma/adapter-mariadb`

## Database Conventions

- UUID IDs: `CHAR(36)`
- UTC timestamps
- `createdAt` + `updatedAt` where mutable state exists
- Financial values: SQL `DECIMAL`; never FLOAT/DOUBLE
- Explicit status enums where lifecycle integrity matters
- Password hashes only; no plaintext password
- Secrets remain in env/secret management, never business tables
- Important admin/financial actions are audited
- Historical financial/business facts are not silently rewritten or deleted
- Reversals/adjustments are separate linked events in later accounting modules
- Migration application is explicit; do not use `prisma migrate dev` without shadow-DB approval

## Core Auth / RBAC / Audit

Primary models include:

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `AuditLog`
- `AuthSession`
- `ImpersonationSession`
- authentication/registration/security singleton configuration models
- `UserIdentifierClaim`
- `SystemSequence`

Auth sessions store only the SHA-256 refresh-token hash. Raw refresh tokens are never stored.

Audit logs retain actor, action, entity, description, metadata, IP/user-agent context and timestamp. Actor FK deletion uses `SET NULL` so history survives account removal where removal is permitted.

## Applied Migration History

### `0001_foundation_auth_rbac`

Foundation users/RBAC/audit schema. Applied locally after a pre-apply backup and verified through `_prisma_migrations` and FK inspection.

### `0002_auth_sessions` through `0004`

Authentication session and security/impersonation foundation. Applied and locally accepted as part of the reusable backend foundation.

### `0005_configurable_auth_registration`

Applied and verified locally on 2026-08-23.

Key changes:

- username required/unique;
- email/mobile conditional claim model;
- `user_identifier_claims` for single-account uniqueness;
- `system_auth_config`;
- `system_registration_config`;
- `system_sequences` race-safe counters;
- required temporary-password state.

CAPTCHA challenge state is intentionally transient and does not use a MySQL business table.

### `0006_referral_foundation`

Applied and accepted with MLM-01. Relational referral profiles, sponsor relationship/history and system referral configuration are MySQL source-of-truth data.

## Package / Plan Foundation — Migration `0007_package_plan_foundation`

PKG-01 introduced:

### `package_definitions`

Immutable stable package identity (`code`) only. Commercial terms do not live here.

### `package_plan_versions`

Versioned plan aggregate containing status/revision, package lifecycle settings, migration/renewal behavior, settlement timezone, effective range and publication/clone actor references.

### `package_plan_items`

Typed versioned commercial terms including:

- stable definition reference, display identity and availability;
- `DECIMAL(20,8)` price and USDT currency;
- typed reward-rate fields using `DECIMAL(9,6)`;
- typed cap basis and `DECIMAL(10,4)` multiplier;
- goal/cycle durations and lifecycle actions.

Unique/check constraints protect intra-plan uniqueness, positive amounts, valid percentage/rate shape and package duration rules.

`0007` seeds the nine stable package definitions and the Founder-approved V1 draft. PKG-01 was subsequently published/cloned through the accepted API workflow.

Local PKG-01 acceptance is GREEN:

- seven migrations applied/schema current;
- Postman API gate GREEN;
- SQL package/audit readback GREEN;
- integrated ADMIN/USER package UI GREEN;
- milestone verification GREEN.

PKG-01 creates no user balance, earning, deposit, subscription or ledger state.

## Deposit Foundation — Migration `0008_deposit_foundation`

Status: **SOURCE IMPLEMENTED / LOCAL DEPLOYMENT AND ACCEPTANCE PENDING**.

Canonical business contract: `docs/DEPOSITS-FOUNDATION.md`.

### `deposit_accounts`

Stores only public receiving-account data:

- immutable UUID;
- operator label;
- asset fixed to `USDT`;
- network fixed to `TRC20`;
- unique public TRON address;
- QR image data-URL payload;
- active/inactive assignment state;
- optimistic revision;
- create/update actor references and timestamps.

No private key, seed phrase, signing key or custody secret is stored.

Application DTO validation performs TRON Base58Check checksum validation before account creation. The SQL layer additionally constrains asset/network and revision invariants.

Receiving addresses are immutable through the application contract. Replacement requires disabling the historical account and creating a new account.

### `deposits`

Stores the manual payment-review fact and immutable assignment snapshots:

- USER owner;
- lifecycle status: `AWAITING_TXID`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`;
- package-plan/version/item references;
- package code/name snapshot;
- exact `DECIMAL(20,8)` amount and currency;
- assigned receiving-account reference;
- assigned account label/address/network/QR snapshots;
- globally unique normalized TXID;
- submit/review timestamps, reviewer and required terminal review note.

### One-open-deposit DB guard

`openKey` is nullable and unique.

For open states:

```text
AWAITING_TXID
PENDING_REVIEW
```

`openKey = userId`.

For terminal states:

```text
APPROVED
REJECTED
```

`openKey = NULL`.

This makes one-open-deposit-per-user a database-enforced invariant even under concurrent requests. MySQL permits multiple `NULL` values in the unique index, so historical terminal deposits remain unlimited.

### TXID / state SQL checks

Database checks require:

- amount > 0;
- currency = USDT;
- assigned network = TRC20;
- TXID absent while `AWAITING_TXID`;
- TXID + submitted timestamp present from `PENDING_REVIEW` onward;
- review timestamp/note absent before terminal review;
- review timestamp/note present for `APPROVED`/`REJECTED`;
- terminal rows have `openKey = NULL`.

TXID has a global unique index; duplicate submission therefore fails even if two requests race.

### Foreign-key behavior

Deposit ownership, package references and assigned receiving account use `RESTRICT` so historical payment facts cannot be orphaned by deletion. Reviewer references may use `SET NULL` while the audit/review timestamp/note remain preserved.

### DEP-01 intentionally does not create

- wallet balance;
- accounting ledger credit;
- package subscription/activation;
- referral commission;
- reward/cap consumption;
- withdrawal/payout;
- blockchain custody or signing state.

Later Wallet/Ledger and package-activation milestones must consume the immutable approved-deposit fact idempotently rather than rewriting DEP-01 history.

## Local migration rule

Before any new migration is deployed locally:

1. run the repository code gate;
2. run read-only `npm run db:status`;
3. inspect the exact pending migration;
4. apply only with explicit `npm run db:deploy`;
5. rerun migration status and the module's SQL/audit acceptance;
6. never reset the real application database merely to bypass a failed migration.

Production migration status is unknown and production deployment remains on HOLD.
