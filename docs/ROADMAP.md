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

Current:
- Inspect and safely resolve 3 high npm audit findings
- Finish Register/Login/Auth lifecycle
- Access + refresh token lifecycle
- Token revocation/logout
- RBAC
- Initial single-database migration apply

Pending in Phase 3:
- Auth DTOs
- AuthService
- User creation/login
- Default USER role assignment
- Audit integration
- Postman token automation
- MongoDB connection/module
- Redis connection/module
- Rate limiting and security baseline

## Later Phases
4. Authentication & Authorization
5. Admin Foundation
6. Packages + AI Agents
7. Deposits / USDT TRC20
8. Wallet/Ledger + Payments/Subscriptions
9. Referral / Commission / Rewards
10. Simulated Trade Activity
11. Template-based Landing Page CMS
12. Template-based Admin UI
13. User Frontend / Dashboard
14. Notifications / Reports
15. QA / Security / Bug Fixing
16. Production Deployment
