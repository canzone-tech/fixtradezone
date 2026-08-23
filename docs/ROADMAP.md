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

- Persist this milestone in project documentation.
- Create the reviewed feature commit.
- Push the feature branch.
- Open/merge PR only after explicit Founder approval.
- Complete reusable-foundation freeze/checkpoint.

Before Packages:

1. Keep FixTradeZone reusable foundation green.
2. Freeze/copy the approved foundation into the reusable core repository.
3. Verify the reusable core independently.
4. Return to FixTradeZone.
5. Begin Packages vertical slice.

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
