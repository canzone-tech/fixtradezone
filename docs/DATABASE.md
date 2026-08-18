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

### FK behaviors
- user -> user_roles: CASCADE
- user_roles -> role: RESTRICT
- role_permissions -> role/permission: CASCADE
- audit actor -> user: SET NULL

## Migration State

`prisma/migrations/0001_foundation_auth_rbac/migration.sql` was generated with `prisma migrate diff --from-empty --to-schema ... --script` and reviewed before application.

On 2026-08-18 it was applied with `prisma migrate deploy` to the local development MySQL `fixtradezone` database after a pre-apply database dump.

Verification confirmed:
- Prisma reports the database schema is up to date.
- `_prisma_migrations` records `0001_foundation_auth_rbac` as finished, not rolled back, with one applied step.
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `audit_logs` exist.
- All five reviewed foreign keys and their delete/update rules match the migration.

This verification applies only to the local development database. It does not imply that staging or production has been migrated.

## RBAC Bootstrap and Registration Verification

The API idempotently upserts the default `USER` role as an active system invariant. Registration also ensures that role inside the same transaction used to create the user and audit event.

Local Postman and SQL verification confirmed:
- a new user is created with `PENDING` status;
- the password is stored as an Argon2id hash;
- the `USER` role is assigned through `user_roles`;
- a `CREATE` audit event with source `SELF_REGISTRATION` is recorded;
- duplicate registration returns HTTP 409 without a second user or audit event.

Do not use `prisma migrate dev` for this project unless a shadow database is explicitly approved. Continue using reviewed migrations and `prisma migrate deploy` for authorized environments.
