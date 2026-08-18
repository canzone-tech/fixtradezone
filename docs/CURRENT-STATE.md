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
- Prisma transitive dependency advisory investigated and documented

## Current Areas
- `src/config/`
- `src/database/prisma.service.ts`
- `src/database/prisma.module.ts`
- `src/health/`
- `src/auth/`
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
- DTO validation dependencies

Not implemented:
- Register
- Login
- Refresh
- Logout/revocation
- Database user lookup in strategy
- Role/permission enforcement
- Auth audit events
- Postman token scripts

## Dependency Security Status
- The 3 high findings originate from Prisma 7.9.1's transitive `deepmerge-ts@7.1.5` dependency.
- A forced Prisma downgrade and an unverified dependency override were rejected.
- The advisory remains tracked in `SECURITY.md`; reassess when Prisma publishes a compatible remediation.

## Immediate Next Actions
1. Review and apply the initial auth/RBAC schema using the existing `fixtradezone` database only.
2. Implement Auth DTOs.
3. Implement Register with Argon2 and default USER role.
4. Implement Login and safe JWT issuance.
5. Implement refresh token rotation/revocation.
6. Integrate audit logging.
7. Configure Postman token automation.
8. Add RBAC guards/permissions.
9. Add MongoDB/Redis modules after auth baseline.

## Constraints
- Never create extra application databases.
- Never use Prisma `migrate dev` without explicit shadow DB approval.
- Never expose secrets.
- Never represent simulated trades as real.
- Never auto-credit deposits from TXID submission.

