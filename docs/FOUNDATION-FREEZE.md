# FixTradeZone — Reusable Foundation Freeze

## Checkpoint

Date: 2026-08-23

Source mainline:
- Repository: `canzone-tech/fixtradezone`
- Main merge checkpoint: `0c2795d`
- Source feature milestone: PR #11
- Freeze branch: `feature/foundation-freeze-checkpoint`

Purpose:

Freeze the locally verified reusable application foundation before FixTradeZone begins product-specific Packages and financial/business vertical slices.

The reusable destination is:

`canzone-platform-core`

## Architecture Boundary

The backend foundation currently has no imports into the only product-side backend module, `dashboard`.

Therefore the reusable platform foundation can be extracted without introducing a dependency on FixTradeZone business modules.

## Bucket A — CORE

Copy as reusable platform foundation, subject only to the adapter sanitization listed below.

### Backend modules

- `backend/src/auth/**`
- `backend/src/captcha/**`
- `backend/src/config/**`
- `backend/src/database/**`
- `backend/src/health/**`
- `backend/src/platform-config/**`
- `backend/src/rbac/**`
- `backend/src/redis/**`
- `backend/src/security-config/**`
- `backend/src/users/**`

### Application bootstrap

- `backend/src/main.ts`
- `backend/src/app.module.ts`

`app.module.ts` is copied with the product-side `DashboardModule` removed.

### Database foundation

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/0001_foundation_auth_rbac/**`
- `backend/prisma/migrations/0002_auth_sessions/**`
- `backend/prisma/migrations/0003_user_impersonation/**`
- `backend/prisma/migrations/0004_security_configuration/**`
- `backend/prisma/migrations/0005_configurable_auth_registration/**`
- `backend/prisma.config.ts`

These migrations represent the reusable account/authentication/RBAC/session/security/configuration foundation.

### Backend project tooling

- `backend/.env.example`
- `backend/.gitignore`
- `backend/.prettierrc`
- `backend/eslint.config.mjs`
- `backend/nest-cli.json`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- reusable scripts required by `package.json`, including SUPER_ADMIN bootstrap

Do not copy:
- local `.env`
- generated Prisma client output
- `node_modules`
- build output
- coverage output
- local secrets

## Bucket B — ADAPTER / SANITIZE DURING COPY

The FixTradeZone source remains unchanged. Sanitization happens only in the reusable-core copy.

### Application composition

`backend/src/app.module.ts`

Remove:
- `DashboardModule`
- any future FixTradeZone business modules

Keep:
- Config
- Prisma
- Redis
- Auth
- RBAC
- Users
- Security Configuration
- Platform Configuration
- Health

### JWT namespace

`backend/src/auth/auth.constants.ts`

Replace FixTradeZone-specific issuer/audience values with reusable platform values or environment-backed application namespace configuration.

Current product-specific values include:

- `fixtradezone-clients`
- `fixtradezone-api`
- `fixtradezone-sessions`
- `fixtradezone-user-impersonation`
- `fixtradezone-password-change`

Security properties must remain unchanged:
- distinct audiences by token purpose
- explicit issuer
- HS256 restrictions
- access/refresh/impersonation/password-change token separation

### Role descriptions

Replace FixTradeZone wording with generic descriptions while preserving role names and authority:

- USER
- ADMIN
- SUPER_ADMIN

### CAPTCHA Redis namespace

`backend/src/captcha/captcha.service.ts`

Replace:

`fixtradezone:captcha:v1`

with a reusable/configurable application namespace.

Do not change:
- Redis TTL
- attempt limit
- HMAC protection
- purpose binding
- atomic consumption
- fail-closed behavior

### Package metadata

`backend/package.json`

Replace product description:

`FixTradeZone NestJS API`

with reusable platform-core metadata.

Regenerate/verify the lockfile only if package metadata or dependencies require it.

### Test fixtures

FixTradeZone-branded fixture values such as:

- `superadmin@fixtradezone.com`
- `admin@fixtradezone.com`
- `FixTradeZone`

must become neutral test data in the reusable repository.

Test behavior and security assertions must remain equivalent.

### Migration comments

Product names appearing only in SQL comments may be changed to generic platform wording.

Migration SQL semantics must not be rewritten merely for cosmetic reasons.

## Bucket C — FIXTRADEZONE-ONLY

Do not copy into `canzone-platform-core` v1:

- `backend/src/dashboard/**`
- future Packages modules
- deposits
- wallet/ledger
- referrals
- commissions
- rewards
- simulated-trade logic
- FixTradeZone CMS/business modules
- FixTradeZone-specific product defaults
- project-specific Postman credentials/data
- product secrets

## Admin UI Boundary

The current `admin/` application is intentionally branded and themed for FixTradeZone.

It is not part of the initial backend platform-core freeze.

Reusable concepts from the admin application may later be extracted into an optional template layer, including:

- same-origin BFF authentication
- HttpOnly authentication cookies
- RBAC-aware navigation
- security configuration UX
- user management UX
- impersonation controls
- idle-lock/reauthentication UX

The FixTradeZone Dark Neo visual identity itself remains product-specific and is not a dependency of the reusable backend core.

## Reusable Security Invariants

The extracted core must preserve:

- JWT deny-by-default
- explicit public-route opt-in
- live session validation
- rotating refresh sessions
- refresh-token hash storage only
- Argon2id password hashing
- SUPER_ADMIN founder/highest-authority protection
- backend-authoritative RBAC
- audited privileged configuration
- required temporary-password replacement
- configurable login/registration policies with safe invariants
- conditional identifier claims
- Redis-backed CAPTCHA with HMAC answer protection
- impersonation isolation
- safe reauthentication
- DTO validation
- transactional audit-sensitive writes
- no plaintext secret/token/password storage

These invariants are not configurable away.

## Independent Verification Gate

The reusable repository is not considered frozen until it independently passes:

1. dependency installation;
2. Prisma generation;
3. Prisma schema validation;
4. backend ESLint;
5. backend test suite;
6. backend production build;
7. Redis connectivity;
8. reviewed local MySQL migration application;
9. authentication/RBAC/configuration/CAPTCHA Postman smoke verification.

FixTradeZone Packages work starts only after this reusable-core verification checkpoint is complete.
