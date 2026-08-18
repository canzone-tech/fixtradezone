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

Not implemented:
- Register handler/service
- Login handler/service
- Refresh handler/service
- Logout/revocation
- Database user lookup in strategy
- Role/permission enforcement
- Auth audit events
- Postman token scripts

## Database Environment Status
- Local development: migration `0001_foundation_auth_rbac` applied and verified.
- Staging: not applied.
- Production: not applied.

## Dependency Security Status
- The 3 high findings originate from Prisma 7.9.1's transitive `deepmerge-ts@7.1.5` dependency.
- A forced Prisma downgrade and an unverified dependency override were rejected.
- The advisory remains tracked in `SECURITY.md`; reassess when Prisma publishes a compatible remediation.

## Immediate Next Actions
1. Add an idempotent RBAC bootstrap for the default USER role.
2. Implement Register transactionally with Argon2 and default USER assignment.
3. Implement Login and safe JWT issuance.
4. Implement refresh token rotation/revocation.
5. Integrate audit logging.
6. Configure Postman token automation.
7. Add RBAC guards/permissions.
8. Add MongoDB/Redis modules after auth baseline.

## Constraints
- Never create extra application databases.
- Never use Prisma `migrate dev` without explicit shadow DB approval.
- Never expose secrets.
- Never represent simulated trades as real.
- Never auto-credit deposits from TXID submission.
