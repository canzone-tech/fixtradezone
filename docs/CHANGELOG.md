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
- Investigated 3 high npm audit findings; confirmed they originate from Prisma 7.9.1 -> `@prisma/config` 7.9.1 -> `deepmerge-ts` 7.1.5.
- Rejected `npm audit --force` because it proposes a breaking Prisma 6.12.0 downgrade.
- Rejected an unverified `deepmerge-ts` 8.x override.
- Prepared repository configuration: root README, safe environment template, backend CI, Dependabot, and pull-request checklist.
- Added non-mutating lint and Prisma generation scripts for local and CI validation.
- Removed the unused required shadow database URL from Prisma CLI configuration; `prisma migrate dev` remains prohibited without explicit approval.
- Replaced the generated NestJS backend README with FixTradeZone-specific setup and safety guidance.
- Updated project context and roadmap to record the GitHub-connected Work workflow and resolved advisory investigation.
