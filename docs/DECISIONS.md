# FixTradeZone — Architecture Decision Log

## ADR-001 — MySQL is the primary relational source of truth
LOCKED. MySQL owns relational/business/accounting data.

## ADR-002 — MongoDB is for flexible document/configuration data
LOCKED. MongoDB owns flexible CMS/template/configuration documents.

## ADR-003 — Redis is cache/queue/temporary state
LOCKED.

## ADR-004 — Single application database
LOCKED. The only real FixTradeZone application database is `fixtradezone` on the existing host MySQL server.

## ADR-005 — Avoid Prisma migrate dev without explicit shadow DB approval
LOCKED. `migrate dev` requires a shadow DB; use a single-database baseline/apply strategy.

## ADR-006 — JWT deny-by-default
LOCKED. All protected/business APIs require JWT. Only explicitly public endpoints are exempt.

## ADR-007 — Health is public
LOCKED. `/health` is public for monitoring.

## ADR-008 — Simulated activity must be labeled
LOCKED. Simulated trades/results are always clearly labeled and never represented as real trading.

## ADR-009 — Deposit account is server-assigned
LOCKED. Backend randomly assigns one active USDT TRC20 account per deposit.

## ADR-010 — Manual TXID approval
LOCKED. User submits TXID; authorized admin manually verifies and approves/rejects. No automatic credit on submission.

## ADR-011 — Production-ready standard
LOCKED. Security, architecture, integrity, scalability, maintainability and auditability are not traded away for speed.

## ADR-012 — Template-based frontend/admin
LOCKED. Public landing page and admin UI use reusable templates/components and configuration rather than one-off hardcoded layouts.

## ADR-013 — Local-first delivery gate
LOCKED. Feature work is completed on a local feature branch. Relevant automated checks and Postman/manual API verification must pass before a pull request is opened against `main`. Pull requests require green CI and review before merge.
