# FixTradeZone Backend

NestJS + TypeScript API for FixTradeZone. MySQL is the relational source of truth, Prisma provides typed data access, and JWT authentication is deny-by-default.

Read the repository-level [`README.md`](../README.md) and [`docs/`](../docs/README.md) before making changes.

## Setup

From the repository root:

```bash
cp .env.example backend/.env
docker compose up -d mongodb redis
cd backend
npm ci
npm run prisma:generate
npm run start:dev
```

The API listens on `http://localhost:3000` by default. `GET /health` is intentionally public; business endpoints must remain protected unless explicitly marked `@Public()`.

Current auth endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me` (Bearer access token required)

After registering the first founder account and applying the reviewed auth-session migration, bootstrap exactly one initial administrator:

```bash
npm run super-admin:bootstrap -- founder@example.com
```

The command refuses to create a second administrator and records its activation and role assignment in the audit log.

## Validation

```bash
npm run prisma:generate
npm run lint
npm test -- --runInBand
npm run build
```

## Database rule

Use only the existing MySQL `fixtradezone` database. Do not run `prisma migrate dev` without explicit shadow-database approval. Review migration SQL and [`docs/DATABASE.md`](../docs/DATABASE.md) before applying schema changes.
