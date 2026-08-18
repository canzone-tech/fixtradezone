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

## Initial Auth/RBAC Schema (drafted, not yet applied)
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
`prisma/migrations/0001_foundation_auth_rbac/migration.sql` exists, was generated with `prisma migrate diff --from-empty --to-schema ... --script`, and reviewed.

It has NOT been applied.

Do NOT use `prisma migrate dev` for this project unless a shadow database is explicitly approved. Continue with a single-database baseline/apply strategy.
