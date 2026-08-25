# FixTradeZone — Database Standards & Current State

## Single Application Database
- Host: 127.0.0.1
- Port: 3306
- Database: `fixtradezone`
- MySQL: 8.0.46
- Runtime user: `fixtradezone`

Do not create additional application databases.

## Prisma
- Prisma: 7.9.1
- Generator: `prisma-client`
- Output: `src/generated/prisma`
- moduleFormat: `cjs`
- Datasource provider: mysql
- URL configured via `prisma.config.ts`
- MySQL connectivity uses `@prisma/adapter-mariadb`
- Local adapter currently uses `allowPublicKeyRetrieval=true`, connectionLimit=10, connectTimeout=5000, acquireTimeout=10000.

## Conventions
- UUID IDs stored as CHAR(36)
- UTC timestamps
- createdAt + updatedAt
- Financial values DECIMAL; example DECIMAL(20,8) for USDT/crypto
- Soft delete only when justified
- Explicit status enums
- Password hashes only
- Secrets via env/secret manager
- Important admin/financial actions audited

## Initial Auth/RBAC Schema

Models:
- User
- Role
- Permission
- UserRole
- RolePermission
- AuditLog
- AuthSession

### User
id, email unique, username optional unique, phone optional unique, passwordHash, firstName, lastName, status (ACTIVE/SUSPENDED/BLOCKED/PENDING), emailVerifiedAt, lastLoginAt, createdAt, updatedAt.

### Role
name unique, description, status (ACTIVE/INACTIVE).

### Permission
code unique, description.

### UserRole
Composite primary key userId + roleId, assignedAt.

### RolePermission
Composite primary key roleId + permissionId.

### AuditLog
actorUserId nullable, action enum:
CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, REJECT, SUSPEND, ACTIVATE, BLOCK, UNBLOCK, PASSWORD_CHANGE, ROLE_CHANGE, PERMISSION_CHANGE; plus entityType, entityId, description, metadata JSON, IP, userAgent, createdAt.

### AuthSession
id (also used as refresh JWT `jti`), userId, SHA-256 refreshTokenHash unique, expiresAt, revokedAt, revocationReason, rotatedToSessionId, createdAt, updatedAt. Raw refresh tokens are never stored.

### FK behaviors
- user -> user_roles: CASCADE
- user_roles -> role: RESTRICT
- role_permissions -> role/permission: CASCADE
- audit actor -> user: SET NULL
- user -> auth_sessions: CASCADE

## Migration State

`prisma/migrations/0001_foundation_auth_rbac/migration.sql` was generated with `prisma migrate diff --from-empty --to-schema ... --script` and reviewed before application.

On 2026-08-18 it was applied with `prisma migrate deploy` to the local development MySQL `fixtradezone` database after a pre-apply database dump.

Verification confirmed:
- Prisma reports the database schema is up to date.
- `_prisma_migrations` records `0001_foundation_auth_rbac` as finished, not rolled back, with one applied step.
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `audit_logs` exist.
- All five reviewed foreign keys and their delete/update rules match the migration.

This verification applies only to the local development database. It does not imply that staging or production has been migrated.

`0002_auth_sessions` through `0006_referral_foundation` are applied and locally
verified in the latest merged-main checkpoint. The next reviewed source migration
is `0007_package_plan_foundation`; its local deployment/acceptance status is
tracked separately below.

## RBAC Bootstrap and Registration Verification

The API idempotently upserts the default `USER` role as an active system invariant. Registration also ensures that role inside the same transaction used to create the user and audit event.

Local Postman and SQL verification confirmed:
- a new user is created with `PENDING` status;
- the password is stored as an Argon2id hash;
- the `USER` role is assigned through `user_roles`;
- a `CREATE` audit event with source `SELF_REGISTRATION` is recorded;
- duplicate registration returns HTTP 409 without a second user or audit event.

Do not use `prisma migrate dev` for this project unless a shadow database is explicitly approved. Continue using reviewed migrations and `prisma migrate deploy` for authorized environments.

## Founder Administrator Bootstrap

The API idempotently ensures `USER`, `ADMIN`, and `SUPER_ADMIN` roles exist. The
one-time `super-admin:bootstrap` CLI uses a serializable transaction to activate
the registered founder account and assign founder authority. It records
system-attributed ROLE_CHANGE and ACTIVATE audit events. All later role
assignments require the normal audited RBAC workflow.

## Configurable Auth/Registration Schema — Migration 0005

Migration `0005_configurable_auth_registration` was applied and verified locally on 2026-08-23.

### Updated User Identifier Rules

Current `users` identifier columns:

- `username` — required and unique.
- `email` — nullable, indexed, not directly unique.
- `phone` — nullable, indexed, not directly unique.
- `phoneVerifiedAt` — nullable verification timestamp.
- `mustChangePassword` — required boolean, default false.

Conditional single-account uniqueness is implemented through `user_identifier_claims`, rather than permanent direct unique indexes on email/mobile.

### UserIdentifierClaim

Stores the normalized EMAIL or MOBILE identifier claimed by a user while that identifier type operates in single-account mode.

The `(type, normalizedValue)` uniqueness constraint prevents duplicate single-account identifiers.

When a configuration moves to multiple-account mode, claims for that identifier type are removed.

When configuration moves back to single-account mode:

1. existing users are checked for duplicates;
2. the transition is rejected if duplicates exist;
3. claims are rebuilt transactionally if the data is safe.

### SystemAuthConfig

Singleton authentication configuration containing:

- loginWithUsername
- loginWithEmail
- loginWithMobile
- captchaOnLoginEnabled
- captchaOnRegistrationEnabled
- updatedByUserId
- createdAt
- updatedAt

### SystemRegistrationConfig

Singleton registration configuration containing:

- publicRegistrationEnabled
- superAdminRegistrationEnabled
- adminRegistrationEnabled
- authorizedUserRegistrationEnabled
- emailRequired
- mobileRequired
- passwordMode
- usernameMode
- usernamePrefixEnabled
- usernamePrefix
- allowMultipleAccountsPerEmail
- allowMultipleAccountsPerMobile
- updatedByUserId
- createdAt
- updatedAt

### SystemSequence

`system_sequences` provides race-safe transactional counters.

Current sequence:

- `username`
- initial/verified local `nextValue`: `100001`

### Local Verification

Verified after migration:

- migration record finished successfully and is not rolled back;
- all new tables exist;
- username unique index exists;
- email and phone non-unique indexes exist;
- configuration singleton records exist;
- username sequence exists;
- existing EMAIL and MOBILE claims were backfilled.

CAPTCHA does not require a MySQL table or migration because challenge state is intentionally short-lived Redis state.

## Package / Plan Foundation — Migration 0007

`0007_package_plan_foundation` introduces three MySQL source-of-truth tables:

### PackageDefinition

`package_definitions` stores immutable stable identity (`code`) only. It contains
no price, rate, cap, duration or other commercial term.

### PackagePlanVersion

`package_plan_versions` stores:
- unique integer version number and `DRAFT`/`PUBLISHED` status;
- whole-plan optimistic `revision`;
- active-package mode/basis;
- activation trigger and plan migration mode;
- renewal mode and upgrade switch;
- settlement timezone and UTC effective range;
- publication, clone and administrator audit references.

### PackagePlanItem

`package_plan_items` stores versioned typed terms:
- definition, display name, slug, sort order and availability;
- `DECIMAL(20,8)` price and explicit `USDT` currency;
- rate mode plus nullable `DECIMAL(9,6)` fixed/min/max percentage fields;
- rate meaning, cap basis, `DECIMAL(10,4)` multiplier and principal treatment;
- goal/cycle day counts and reward/cycle action modes.

Unique constraints prevent duplicate definition, slug or sort order inside one
plan. SQL checks enforce positive price/multiplier, valid rate-field shape,
percentage bounds, USDT currency, positive durations and cycle not exceeding
goal.

The migration seeds:
- nine stable package definitions;
- V1 as an intentionally unpublished revision-1 draft;
- the nine Founder-approved initial items;
- a system-attributed migration audit row.

It does not create `UserPackage`, balances, earnings, cap consumption, deposits
or ledger records.

Source/schema/static gates are GREEN in the Work checkpoint. Local deployment,
migration-status verification, Postman acceptance and SQL readback remain
required under `docs/LOCAL-VERIFY-PACKAGES.md` before this migration is recorded
as locally accepted.
