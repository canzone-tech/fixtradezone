# FixTradeZone — Current State

## Snapshot
Date: 2026-08-18
Phase: 3 — Backend Foundation
Focus: Authentication + secure API foundation.

## Verified Working
- Docker functional
- MySQL 8.0.46 host service functional
- `fixtradezone` DB accessible by `fixtradezone` user
- MongoDB 8 healthy
- Redis 7 healthy
- NestJS builds
- Prisma 7.9.1 client generated
- Prisma runtime connection to MySQL works
- `GET /health` returns MySQL up
- Postman installed and health tested
- JWT strategy compiles
- Global JWT guard compiles
- Initial Auth/RBAC migration applied and verified in local development
- Global DTO request validation configured
- Auth DTO validation covered by focused unit tests
- Transactional registration with Argon2id hashing
- Idempotent default USER role bootstrap and assignment
- Registration audit event
- Registration verified through Postman and direct SQL checks
- Prisma transitive dependency advisory investigated and documented

## Current Areas
- `src/config/`
- `src/database/prisma.service.ts`
- `src/database/prisma.module.ts`
- `src/health/`
- `src/auth/`
- `src/auth/dto/`
- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/migrations/0001_foundation_auth_rbac/migration.sql`

## Auth Status

Implemented:
- Public decorator
- Global JWT guard
- JWT strategy
- Auth module skeleton
- Argon2 dependency
- Global `ValidationPipe` with unknown-field rejection
- Register, Login, RefreshToken, and Logout DTOs
- Email and username normalization
- Registration password, username, phone, and name constraints
- Refresh/logout JWT-shape validation
- DTO unit tests
- Public Register controller and service
- Argon2id password hashing service
- Transactional user, USER role, and audit creation
- Duplicate-identifier conflict handling
- Registration service, RBAC bootstrap, and password service tests

Not implemented:
- Login handler/service
- Refresh handler/service
- Logout/revocation
- Database user lookup in strategy
- Role/permission enforcement
- Login, logout, token-lifecycle, and authorization audit events
- Postman token scripts

## Manual API Verification
- `GET /health` returns HTTP 200 with MySQL up.
- `POST /auth/register` returns HTTP 201 with a safe user projection.
- Repeating the same registration returns HTTP 409.
- Invalid email, short password, and injected `role` return HTTP 400.
- `GET /` returns HTTP 404 because no root route is registered; no protected business endpoint exists yet for a manual 401 check.
- SQL verification confirmed Argon2id, PENDING status, USER role assignment, and the registration audit event.

## Database Environment Status
- Local development: migration `0001_foundation_auth_rbac` applied and verified.
- Staging: not applied.
- Production: not applied.

## Dependency Security Status
- The 3 high findings originate from Prisma 7.9.1's transitive `deepmerge-ts@7.1.5` dependency.
- A forced Prisma downgrade and an unverified dependency override were rejected.
- The advisory remains tracked in `SECURITY.md`; reassess when Prisma publishes a compatible remediation.

## Immediate Next Actions
1. Implement Login with generic credential errors and status enforcement.
2. Issue short-lived access tokens and rotating refresh tokens safely.
3. Add refresh-token persistence, rotation, revocation, and logout.
4. Load the current user and status in the JWT strategy.
5. Expand auth audit logging.
6. Configure Postman token automation.
7. Add RBAC guards/permissions.
8. Add MongoDB/Redis modules after auth baseline.

## Constraints
- Never create extra application databases.
- Never use Prisma `migrate dev` without explicit shadow DB approval.
- Never expose secrets.
- Never represent simulated trades as real.
- Never auto-credit deposits from TXID submission.
