## Summary

Describe what changed and why.

## Scope

- [ ] The pull request is focused and contains no unrelated changes.
- [ ] No secrets, credentials, tokens, private keys, seed phrases, or local `.env` files are included.

## Architecture and data safety

- [ ] Locked decisions in `docs/DECISIONS.md` remain intact.
- [ ] MySQL/MongoDB/Redis data ownership is respected.
- [ ] Financial values use `DECIMAL`; ledger and approval controls remain safe.
- [ ] Simulated activity is clearly labeled and cannot be mistaken for real trading.
- [ ] Any Prisma migration SQL was reviewed; `prisma migrate dev` was not used without explicit approval.

## Security and validation

- [ ] Protected APIs remain deny-by-default behind JWT and RBAC as applicable.
- [ ] Inputs are validated and sensitive values are not logged or returned.
- [ ] Admin and financial actions remain authorized and auditable.

## Verification

- [ ] `npm run prisma:generate`
- [ ] `npm run lint`
- [ ] `npm test -- --runInBand`
- [ ] `npm run build`
- [ ] Relevant manual/API checks were completed.

## Documentation

- [ ] Relevant files under `docs/` were updated, or documentation was not affected.

