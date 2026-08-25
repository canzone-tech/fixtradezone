# FixTradeZone — Roadmap

## Phase 0 — Requirements & Architecture
Status: approved/locked.

## Phase 1 — Environment
Status: completed.

Ubuntu 24.04, Git, Node.js, Docker, Docker Compose.

## Phase 2 — Infrastructure
Status: completed.

- MySQL 8 host service
- MongoDB 8 Docker
- Redis 7 Docker
- Local connectivity verified

## Phase 3 — Reusable Backend Foundation
Status: active / substantially verified.

Completed:

- NestJS application foundation
- Config + Joi environment validation
- Prisma 7.9.1
- MariaDB adapter / MySQL runtime connectivity
- Health endpoint
- Global fail-closed DTO validation
- JWT deny-by-default authentication
- Rotating persisted refresh sessions
- RBAC roles/permissions
- Founder SUPER_ADMIN protection
- User impersonation security boundary
- SUPER_ADMIN security configuration
- Idle-lock/session reauthentication
- Configurable username/email/mobile authentication
- Configurable registration-source policy
- AUTO/MANUAL/AUTO_OR_MANUAL password creation
- AUTO/MANUAL/AUTO_OR_MANUAL username creation
- Race-safe generated username sequence
- Conditional email/mobile identifier claims
- Single/multiple-account transition safety
- Required temporary-password replacement flow
- Redis application module/service
- Custom LOGIN/REGISTRATION CAPTCHA
- SUPER_ADMIN authentication/registration configuration APIs
- Migration `0005_configurable_auth_registration`
- Local Postman verification
- 23 backend suites / 124 tests passing
- Production build and feature lint passing

Current:

- Reusable foundation freeze is complete.
- MLM-01 Referral Foundation is complete, merged and locally accepted on `main`.
- PKG-01 Q33–Q39 and safe defaults are Founder-approved.
- PKG-01 database/NestJS/static implementation is complete on
  `feature/packages-foundation`.
- Local migration, Postman and SQL acceptance is the active gate.
- Package BFF/UI follows only after the backend/API gate is GREEN.

PKG-01 delivery order:

1. Deploy and verify migration `0007_package_plan_foundation` locally.
2. Complete the ordered PKG-01 Postman and SQL gate.
3. Implement same-origin BFF routes and Dark Neo admin/USER package pages.
4. Complete integrated browser/API acceptance.
5. Update final milestone state and open a PR only after all gates are GREEN.

## Later Product Phases

4. Packages + AI Agents
5. Deposits / USDT TRC20
6. Wallet / Ledger / Payments / Subscriptions
7. Referral / Commission / Rewards
8. Simulated Trade Activity
9. Minimal v1 landing content controls
10. Template-based Admin UI expansion
11. User Dashboard vertical slices
12. Notifications / Reports
13. QA / Security / Bug Fixing
14. Production Deployment

Full configurable CMS remains a v2 concern unless explicitly reprioritized.
