# FixTradeZone

FixTradeZone is a template-driven platform for packages, subscriptions, deposits, wallet/ledger operations, referrals, rewards, and clearly labeled simulated trade activity.

> Current status: MLM-01 is merged/accepted; PKG-01 Packages / Plan Foundation
> backend is awaiting its local migration and Postman gate before BFF/UI work.
>
> FixTradeZone does not execute real trades. Any displayed trade activity must be explicitly labeled **Simulated Trade Activity**.

## Source of truth

The repository and the documents under [`docs/`](docs/README.md) are the canonical project record. Start with:

1. [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md) — verified implementation state and immediate next work.
2. [`docs/DECISIONS.md`](docs/DECISIONS.md) — locked architecture decisions.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries and data ownership.
4. [`docs/SECURITY.md`](docs/SECURITY.md) — mandatory security standards.
5. [`docs/ROADMAP.md`](docs/ROADMAP.md) — delivery phases.

## Architecture

| Area | Technology | Responsibility |
|---|---|---|
| Public frontend | Next.js | Landing pages and user experience |
| Admin panel | Next.js | Administration and approvals |
| API | NestJS + TypeScript | Business logic, validation, auth, and auditability |
| Relational data | MySQL 8 | Business, accounting, ledger, user, and RBAC source of truth |
| Flexible documents | MongoDB 8 | CMS, templates, themes, and flexible configuration |
| Temporary state | Redis 7 | Cache, queues, rate limits, and temporary coordination |
| ORM | Prisma 7 | Typed relational data access and reviewed migrations |

## Repository layout

```text
admin/       Next.js admin application (authentication shell in progress)
backend/     NestJS API and Prisma schema
docs/        Persistent project context and decisions
frontend/    Next.js public/user application (planned/in progress)
```

## Local backend setup

Prerequisites:

- Node.js 24
- MySQL 8 with the existing `fixtradezone` database
- Docker and Docker Compose for MongoDB and Redis

```bash
docker compose up -d mongodb redis
cp .env.example backend/.env
cd backend
npm ci
npm run prisma:generate
npm run build
npm run start:dev
```

Replace every placeholder in `backend/.env` before starting the API. Never commit that file.

Health check:

```bash
curl http://localhost:3000/health
```

After the reviewed auth-session migration is applied and a founder account is registered, the first administrator can be bootstrapped once:

```bash
cd backend
npm run super-admin:bootstrap -- founder@example.com
```

Start the admin application on port 3001:

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

## Database safety

- The existing MySQL database named `fixtradezone` is the only application database.
- Do not run `prisma migrate dev`; it requires a shadow database and is prohibited unless explicitly approved.
- Do not apply a migration until its SQL has been reviewed and the current-state documentation authorizes the step.
- Use `DECIMAL` for financial values and immutable ledger records where appropriate.

## Security baseline

- JWT authentication is deny-by-default; only explicit `@Public()` routes are unauthenticated.
- `/health` is intentionally public for monitoring.
- Passwords use Argon2.
- Never store or expose plaintext passwords, raw tokens, seed phrases, private keys, or environment secrets.
- A submitted deposit TXID never auto-credits a balance; an authorized admin must approve it and the action must be audited.

## Quality checks

From the repository root:

```bash
npm run verify:local
npm run verify:milestone
```

Database deployment remains a separate explicit write: `npm run db:deploy`.
For PKG-01 follow [`docs/LOCAL-VERIFY-PACKAGES.md`](docs/LOCAL-VERIFY-PACKAGES.md).

## Delivery workflow

- Work on focused branches and open draft pull requests into `main`.
- Keep architecture, security, API, database, current-state, and changelog documentation synchronized with material changes.
- Do not weaken validation, data integrity, financial controls, auditability, or maintainability for speed.
