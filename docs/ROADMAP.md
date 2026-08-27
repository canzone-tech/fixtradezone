# FixTradeZone — Roadmap

## Phase 0 — Requirements & Architecture
Status: approved/locked.

## Phase 1 — Environment
Status: completed.

Ubuntu 24.04, Git, Node.js, Docker, Docker Compose.

## Phase 2 — Infrastructure
Status: completed for local development.

- MySQL 8 host service
- MongoDB 8 Docker reserved for later document/CMS use
- Redis 7 Docker for transient/runtime features where required
- Local connectivity verified

Production deployment is intentionally deferred until the product milestones and local acceptance gates are complete.

## Phase 3 — Reusable Backend + Protected Application Foundation
Status: substantially complete.

Completed:

- NestJS application foundation
- Config + Joi environment validation
- Prisma 7.9.1 + MariaDB adapter / MySQL runtime connectivity
- Health endpoint
- Global fail-closed DTO validation
- JWT deny-by-default authentication
- Rotating persisted refresh sessions
- RBAC roles/permissions
- Founder SUPER_ADMIN protection
- User impersonation security boundary
- SUPER_ADMIN security configuration
- Idle-lock/session reauthentication
- Configurable username/email/mobile authentication and registration-source policy
- AUTO/MANUAL/AUTO_OR_MANUAL password + username creation
- Required temporary-password replacement flow
- Redis integration for transient features such as CAPTCHA
- Custom LOGIN/REGISTRATION CAPTCHA
- Same-origin Next.js BFF + HttpOnly/SameSite browser session boundary
- Shared Dark Neo ADMIN/USER shell
- Full-app PWA foundation and trusted local HTTPS/LAN verification

## MLM-01 — Referral Foundation
Status: COMPLETE / merged to `main`.

- referral profiles and sponsor relationships
- registration-time referral attribution
- default/root sponsor configuration
- sponsor-change controls/history/audit
- USER referral workspace
- ADMIN referral management workspace
- integrated local API/UI acceptance

## PKG-01 — Packages / Plan Foundation
Status: COMPLETE / locally accepted; PR/main handoff pending.

Completed and accepted locally:

- migration `0007_package_plan_foundation`
- immutable package definitions
- atomic versioned package-plan/item aggregate
- nine-package V1 configuration
- draft/update/clone/publish lifecycle
- SUPER_ADMIN publication controls
- exact decimal package economics
- protected ADMIN/USER APIs
- same-origin BFF routes
- Dark Neo `/packages` workspace
- Dark Neo `/user/packages` catalogue
- ordered Postman gate GREEN
- SQL/audit readback GREEN
- 7 migrations / schema up to date
- backend 26/26 suites, 148/148 tests
- backend lint/build/diff GREEN
- admin lint/typecheck/Next production build GREEN (44 routes)
- full-app PWA/mobile HTTPS acceptance GREEN
- working tree clean at final local gate

PKG-01 intentionally contains no purchase, activation, balance, earning, deposit, subscription or ledger mutation.

## V1 Product Sequence — LOCKED CURRENT ORDER

1. **DEP-01A — Deposit Accounts / USDT TRC20 receiving-account management**
2. **DEP-01B — Deposits / random account assignment / TXID submission / manual approval-rejection**
3. Wallet / Ledger foundation and controlled accounting credit
4. Package subscription / activation from approved payment
5. Referral commission foundation on legitimate package/payment events
6. Rewards / caps / lifecycle accounting
7. **Simulated Trade Activity display only** — clearly labelled simulated; no real trading engine
8. Minimal v1 landing content controls / template integration
9. Remaining USER dashboard vertical slices and operational ADMIN screens
10. Notifications / reports required for v1
11. QA / security / bug fixing / release hardening
12. Production deployment

## Explicit V1 Scope Correction

There is **no AI Agents milestone in FixTradeZone v1**. Older planning/backbone references to an `AI Agents` module are superseded by the Founder's later scope decision. FixTradeZone does not execute real trades and will not implement an AI trading engine, broker/exchange execution, strategy execution or trade automation.

Any future activity visualization must remain explicitly labelled **Simulated Trade Activity** / **SIMULATED RESULTS** and must never be represented as real trading or realized/withdrawable trading profit.

## CMS

A broad configurable CMS remains a v2 concern unless explicitly reprioritized. V1 may implement only the minimal landing/template controls required to launch safely.
