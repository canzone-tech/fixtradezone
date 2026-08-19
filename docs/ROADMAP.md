# FixTradeZone — Roadmap

## Phase 0 — Requirements & Architecture
Status: approved/locked.

## Phase 1 — Environment
Status: completed.
Ubuntu 24.04, Git, Node.js, Docker, Docker Compose.

## Phase 2 — Infrastructure
Status: completed.
Host MySQL 8.0.46, MongoDB 8 Docker, Redis 7 Docker, connectivity verified.

## Phase 3 — Backend Foundation
Status: in progress.

Completed:
- NestJS project
- Config + Joi validation
- Prisma 7.9.1
- Prisma Client generation
- MariaDB adapter
- PrismaService
- MySQL runtime connection
- `/health`
- Postman setup
- JWT strategy foundation
- Global JWT guard
- Public decorator
- Auth module skeleton
- Argon2 dependency
- class-validator / class-transformer dependencies
- Prisma transitive dependency advisory investigated and documented
- Repository README, environment template, CI, dependency updates, and PR checklist prepared
- Initial Auth/RBAC migration applied and verified in local development
- Global fail-closed request validation
- Register, Login, RefreshToken, and Logout DTOs
- Transactional public registration with Argon2id hashing
- Idempotent default USER role bootstrap and assignment
- Registration audit event
- Registration Postman and database verification

Current:
- Validate Login and safe JWT issuance locally
- Validate access + refresh token lifecycle and revocation locally
- Validate database user/status lookup in the JWT strategy
- Validate the minimal Next.js admin auth shell
- RBAC guards and permissions

Pending in Phase 3:
- Local migration and Postman validation for auth sessions
- Admin dependency lockfile, lint, and production build
- Broader auth audit integration
- MongoDB connection/module
- Redis connection/module
- Rate limiting and security baseline

## Later Phases
4. Authentication & Authorization
5. Admin Foundation (auth shell started alongside Phase 3 API work)
6. Packages + AI Agents
7. Deposits / USDT TRC20
8. Wallet/Ledger + Payments/Subscriptions
9. Referral / Commission / Rewards
10. Simulated Trade Activity
11. Minimal v1 landing content controls; full configurable CMS moves to v2
12. Template-based Admin UI expansion
13. User Frontend / Dashboard
14. Notifications / Reports
15. QA / Security / Bug Fixing
16. Production Deployment
