# FixTradeZone — Changelog

## 2026-08-23
- Merged PR #11 (`feature/configurable-auth-registration`) into `main` at `0c2795d`.
- Started `feature/foundation-freeze-checkpoint` to inventory, sanitize, freeze, and independently verify the reusable platform core before Packages.
- Added SUPER_ADMIN-controlled configurable username/email/mobile login methods with invariant enforcement.
- Decoupled JWT/session identity from mutable email identifiers and retained UUID/session identity as the technical authority.
- Added configurable public, SUPER_ADMIN, ADMIN, and authorized-USER registration policy.
- Added configurable AUTO/MANUAL/AUTO_OR_MANUAL password and username creation modes.
- Added race-safe generated usernames with a persisted system sequence and optional prefix.
- Added nullable email/mobile identifiers plus conditional `user_identifier_claims` for single-account uniqueness.
- Added transactional SINGLE/MULTIPLE account-mode transitions with duplicate detection and claim rebuilding.
- Added mandatory one-purpose password-change flow for automatically generated temporary passwords.
- Prevented temporary-password users from receiving normal access/refresh sessions before replacing the password.
- Added migration `0005_configurable_auth_registration` and verified it in local MySQL.
- Added reusable Redis application infrastructure using `ioredis` and verified live `PING -> PONG` connectivity.
- Added custom LOGIN/REGISTRATION CAPTCHA with Redis TTL, HMAC-protected answer state, attempt limits, purpose binding, atomic consumption, and replay protection.
- Added SUPER_ADMIN authentication and registration configuration APIs.
- Verified the complete backend regression suite: 23 suites / 124 tests passing.
- Verified NestJS production build, feature-only ESLint, and whitespace checks.
- Verified Configurable Auth, Registration, required-password-change, and CAPTCHA flows locally through Postman.

## 2026-08-21
- Started the secure user-impersonation vertical slice on `agent/user-impersonation`.
- Added `users.impersonate` RBAC authority and eligible ordinary-USER impersonation controls.
- Added migration `0003_user_impersonation` with persisted/audited impersonation sessions and start/stop audit actions.
- Added a dedicated impersonation JWT/session strategy isolated from normal administrator authentication.
- Prevented impersonation tokens from authenticating against administrator APIs.
- Added safe Return-to-Admin behavior and same-origin Next.js BFF impersonation cookies/routes.
- Added migration `0004_security_configuration` with SUPER_ADMIN-controlled Full Impersonation mode and 1–120 minute idle-lock policy.
- Added live LIMITED/FULL impersonation evaluation and server-side full-impersonation authorization guard.
- Added protected password reauthentication and safe authenticated session-policy API.
- Added the SUPER_ADMIN Security Configuration Dark Neo UI and sidebar shortcut.
- Replaced the temporary shell-less USER proof page with the approved USER shell using the same master Dark Neo sidebar/topbar visual system.
- Added persistent Viewing-as / Return-to-Admin context to the USER impersonation experience.
- Added the shared inactivity lock overlay for administrator and impersonated USER sessions.
- Verified that impersonated-session unlock requires the original administrator actor password and preserves the same page/session.
- Corrected `/users` desktop table sizing to consume the full available content width while preserving internal responsive table scrolling.
- Verified backend tests/build, Postman security/session flows, admin lint/build, browser UI behavior, and whitespace checks locally.

## 2026-08-20
- Merged PR #8, establishing the secure Dark Neo admin console foundation.
- Locked the approved dashboard/global admin design and shared protected application shell.
- Added and approved the `/rbac` Roles & Permissions console.
- Reused the existing RBAC read/manage APIs and permission contracts.
- Preserved SUPER_ADMIN founder protection and base USER role protection.
- Added permission-aware sidebar visibility for administrator accounts.
- Locked the universal responsive backend contract for future admin/user modules.
- Verified admin lint and Next.js production build with the RBAC route.

## 2026-08-19
- Started the focused auth-session + admin-shell vertical slice on `agent/auth-session-admin-foundation`.
- Added Login with generic credential errors, Argon2 verification, ACTIVE-status enforcement, short-lived access tokens, persisted refresh sessions, last-login update, and audit logging.
- Added rotating refresh tokens, concurrent/reused-token response, logout revocation, and protected `GET /auth/me` with a fresh MySQL user/status/RBAC lookup.
- Added the reviewed-source draft `0002_auth_sessions` migration; it has not yet been applied to any environment.
- Added ADMIN role bootstrap and a one-time audited founder bootstrap CLI.
- Added focused login, rotation, logout, token, strategy, and founder-bootstrap tests.
- Added a safe Postman collection/environment that automatically stores and rotates test tokens.
- Added a Next.js 16 admin application using the FixTradeZone dark neon design system.
- Added a same-origin admin BFF that keeps access and refresh tokens in HttpOnly cookies and enforces ADMIN access.
- Kept unimplemented modules visibly queued instead of displaying fake data or metrics.
- Recorded the fast-v1 scope: launch-critical controls now, fully configurable CMS in v2.
- Rebased the slice onto the locally verified Login/Me milestone and resolved the overlapping auth implementation without overwriting it.
- Bound access JWTs to active persisted sessions and retained HS256 issuer/audience verification.
- Preserved timing-safe dummy password verification and added corrupted-hash fallback handling.
- Added serializable one-time founder bootstrap protection and system-attributed audit events.
- Generated the admin lockfile; backend lint/build and 36 tests pass, while admin lint/build and production dependency audit pass.

## 2026-08-18
- Added persistent project documentation under `docs/`.
- Established repository documentation as the project source of truth for cross-chat continuity.
- NestJS backend established.
- Config + Joi validation established.
- Prisma 7.9.1 integrated.
- Prisma Client generated under `src/generated/prisma`.
- MySQL connectivity established through `@prisma/adapter-mariadb`.
- Local MySQL 8 RSA public-key retrieval compatibility configured.
- `/health` verified.
- Postman installed and health verified.
- JWT strategy and global JWT guard foundation created.
- `/health` explicitly public.
- Argon2, Passport/JWT, class-validator and class-transformer dependencies added.
- Initial RBAC/auth Prisma schema drafted.
- Initial migration generated and reviewed.
- Applied and verified `0001_foundation_auth_rbac` in the local development database using `prisma migrate deploy` after a database backup.
- Verified all Auth/RBAC tables, migration history, foreign keys, and referential actions.
- Added Register, Login, RefreshToken, and Logout DTOs with normalization and bounded validation.
- Added a global fail-closed `ValidationPipe` that rejects unknown fields and suppresses submitted values in validation errors.
- Added focused Auth DTO unit tests.
- Applied and verified the local-first delivery gate before opening the final pull request.
- Added OWASP-minimum Argon2id password hashing and verification.
- Added an idempotent default USER role bootstrap.
- Added transactional public registration with safe response projection, default role assignment, and an audit event.
- Added duplicate-identifier conflict handling and registration service tests.
- Verified registration through Postman and direct SQL inspection.
- Investigated 3 high npm audit findings; confirmed they originate from Prisma 7.9.1 -> `@prisma/config` 7.9.1 -> `deepmerge-ts` 7.1.5.
- Rejected `npm audit --force` because it proposes a breaking Prisma 6.12.0 downgrade.
- Rejected an unverified `deepmerge-ts` 8.x override.
- Prepared repository configuration: root README, safe environment template, backend CI, Dependabot, and pull-request checklist.
- Added non-mutating lint and Prisma generation scripts for local and CI validation.
- Removed the unused required shadow database URL from Prisma CLI configuration; `prisma migrate dev` remains prohibited without explicit approval.
- Replaced the generated NestJS backend README with FixTradeZone-specific setup and safety guidance.
- Updated project context and roadmap to record the GitHub-connected Work workflow and resolved advisory investigation.

## 2026-08-24 — Platform foundation completed

- Completed configurable authentication and registration frontend integration.
- Completed role-aware login for SUPER_ADMIN, ADMIN and standard USER accounts.
- Added native USER session BFF boundary.
- Added premium USER dashboard and USER profile.
- Preserved secure ADMIN/USER impersonation isolation.
- Unified protected application visual identity under the Dark Neo design system.
- Locked the canonical FixTradeZone project logo and shared authenticated Sign Out UX.
- Verified Postman MASTER v10 role-aware flow.
- Verified frontend lint/build and backend tests/build.
- Foundation phase approved for merge before MLM development.
