# FixTradeZone — Architecture

## High-Level Architecture
```text
                        FixTradeZone
                              |
               +--------------+--------------+
               |                             |
          Public Frontend                 Admin Panel
             Next.js                  Next.js UI + BFF
               |                             |
               +--------------+--------------+
                              |
                          NestJS API
                              |
          +-------------------+-------------------+
          |                   |                   |
        MySQL              MongoDB              Redis
   relational source      document/config       cache/queue/
     of truth              data store           temporary state
```

## Technology Stack
- Ubuntu 24.04 LTS
- NestJS + TypeScript backend
- Next.js public frontend
- Next.js admin panel
- MySQL 8.0.46
- MongoDB 8 (Docker)
- Redis 7-alpine (Docker)
- Prisma 7.9.1
- REST APIs initially
- JWT access + refresh tokens
- Argon2 password hashing
- Docker / Docker Compose
- Git/GitHub
- CI/CD planned

## Data Ownership
### MySQL
Users, roles/permissions, packages, subscriptions, deposits, deposit accounts, wallet/ledger, payments, referrals, commissions, rewards, and relational/accounting data.

### MongoDB
Landing-page templates, themes, CMS sections, page versions, flexible AI configuration, simulated activity documents, and suitable flexible events/logs.

### Redis
Cache, queues, sessions/temporary state, rate limiting, and background-job coordination.

## Core Rules
- Do not duplicate the same source-of-truth data across MySQL and MongoDB.
- Financial values use DECIMAL, never FLOAT/DOUBLE.
- Ledger records are immutable where appropriate.
- Do not directly manipulate financial balances through unsafe updates.
- Admin access/refresh tokens remain in HttpOnly cookies at the Next.js BFF boundary; NestJS remains the identity and RBAC authority.
- Persist only refresh-token hashes in MySQL. Redis is not the source of truth for durable authentication revocation.
