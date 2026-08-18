# FixTradeZone — Changelog

## 2026-08-18
- Added persistent project documentation under `docs/`.
- Established repository documentation as the project source of truth for cross-chat continuity.
- NestJS backend established.
- Config + Joi validation established.
- Prisma 7.9.1 integrated.
- Prisma Client generated under `src/generated/prisma`.
- MySQL connectivity established through `@prisma/adapter-mariadb`.
- Local MySQL 8 RSA public-key retrieval compatibility configured.
- `/health` verified.
- Postman installed and health verified.
- JWT strategy and global JWT guard foundation created.
- `/health` explicitly public.
- Argon2, Passport/JWT, class-validator and class-transformer dependencies added.
- Initial RBAC/auth Prisma schema drafted.
- Initial migration generated and reviewed but not applied.
- Latest dependency installation produced 3 high npm audit findings; investigation is required before continuing auth implementation.
