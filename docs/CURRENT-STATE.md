# FixTradeZone — Current State

## Snapshot
Date: 2026-08-19
Phase: 3 — Backend Foundation
Focus: Authentication session lifecycle + minimal admin foundation.

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
- Auth-session branch rebased onto the verified Login/Me commit
- Prisma Client generated successfully for the AuthSession schema
- Backend lint and production build pass
- Backend unit tests pass: 8 suites, 36 tests
- Admin lockfile generated; admin lint and production build pass
- Admin production dependency audit reports zero vulnerabilities

## Implemented on Current Feature Branch — Local DB/API/Browser Validation Pending
- Public Login, Refresh, and Logout handlers
- Generic login/session errors and ACTIVE-user enforcement
- 15-minute access token and 7-day rotating refresh token issuance
- Hashed refresh-token persistence, revocation, rotation, and reuse response
- Database-backed active-session and current-user/RBAC lookup for protected requests
- Protected `GET /auth/me`
- Login, refresh, logout, and session-security audit events
- Postman collection/environment with automatic access/refresh token rotation
- Idempotent ADMIN role bootstrap plus one-time audited founder bootstrap CLI
- Auth-session migration `0002_auth_sessions` drafted for review
- Minimal Next.js admin login and protected dashboard shell
- HttpOnly admin cookies managed by a same-origin Next.js BFF layer
- Admin CSP/security headers, cross-site request rejection, and backend-response validation
- Original admin UI based on the approved Rizz visual direction; no template backend reused

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
- Login, refresh, logout, and current-user source implementation
- Refresh-session persistence and rotation model
- Founder ADMIN bootstrap source implementation
- Focused auth-session unit tests

Not implemented:
- Role/permission enforcement
- Authentication rate limiting
- General administrator assignment API

## Manual API Verification
- `GET /health` returns HTTP 200 with MySQL up.
- `POST /auth/register` returns HTTP 201 with a safe user projection.
- Repeating the same registration returns HTTP 409.
- Invalid email, short password, and injected `role` return HTTP 400.
- `GET /` returns HTTP 404 because no root route is registered; no protected business endpoint exists yet for a manual 401 check.
- SQL verification confirmed Argon2id, PENDING status, USER role assignment, and the registration audit event.

## Database Environment Status
- Local development: migration `0001_foundation_auth_rbac` applied and verified.
- Migration `0002_auth_sessions`: generated, reviewed as additive, and not yet applied to any environment.
- Staging: not applied.
- Production: not applied.

## Dependency Security Status
- The 3 high findings originate from Prisma 7.9.1's transitive `deepmerge-ts@7.1.5` dependency.
- A forced Prisma downgrade and an unverified dependency override were rejected.
- The advisory remains tracked in `SECURITY.md`; reassess when Prisma publishes a compatible remediation.

## Immediate Next Actions
1. Pull the reviewed feature branch and rerun the automated gate locally.
2. Back up the existing database, then apply and verify `0002_auth_sessions` with `prisma migrate deploy`.
3. Register the founder account and run the one-time ADMIN bootstrap CLI.
4. Verify Login, Me, Refresh rotation, old-token rejection, and Logout in Postman.
5. Verify admin login, refresh continuity, ADMIN rejection, and logout in the browser.
6. Add backend RBAC guards/permissions with the Users & RBAC admin screen.
7. Add deployment-level authentication rate limiting before public launch.

## Constraints
- Never create extra application databases.
- Never use Prisma `migrate dev` without explicit shadow DB approval.
- Never expose secrets.
- Never represent simulated trades as real.
- Never auto-credit deposits from TXID submission.
