# FixTradeZone — Current State

## Canonical Checkpoint — 2026-09-20

Repository code plus `/docs` are the permanent source of truth. Do not rely on an older chat summary when repository state differs.

## Mainline checkpoint

`main` remains at:

```text
4c748968c5553dae42415010a9757f1589cc2883
```

This is the merged PR #29 checkpoint:

`fix(portal): complete session, impersonation, referral and live market UX`

Production was previously confirmed green at that main checkpoint.

## Active development branch

`feature/canonical-trades-profile-onboarding`

The current feature contains the canonical Daily Trade -> Internal Trading cutover plus required profile/withdrawal-wallet/onboarding UX work.

Full handoff and locked rules:

- `docs/CANONICAL-TRADES-PROFILE-ONBOARDING-CHECKPOINT.md`

## Current scope status

### Canonical trading

Status: **IMPLEMENTATION COMPLETE IN FEATURE BRANCH; LOCAL ACCEPTANCE PENDING**.

Locked architecture:

`Daily Trade = immutable source identity/result -> Internal Trading = financial interpretation/settlement`

New canonical normal Internal Trading cannot independently generate schedule, asset, outcome or raw result. It consumes the already-existing Daily Trade and preserves canonical identity. Legacy history remains forward-only and immutable. `TARGET_RECONCILIATION` remains an explicit financial closure path.

Migration:

- `0045_canonical_daily_trade_financial_link`

### Required profile + BEP-20 withdrawal wallet

Status: **IMPLEMENTED IN FEATURE BRANCH; LOCAL ACCEPTANCE PENDING**.

Required profile fields are first name, last name, E.164 mobile and a saved USDT BNB Smart Chain (BEP-20) withdrawal address.

The first saved withdrawal address starts a 30-day server-enforced lock. Every later allowed change restarts the 30-day lock. No silent admin bypass exists in this scope.

Migration:

- `0046_user_withdrawal_profile`

### Payout binding

Status: **IMPLEMENTED IN FEATURE BRANCH; LOCAL ACCEPTANCE PENDING**.

USER payout creation is server-bound to the currently saved profile withdrawal address. Payout history preserves the immutable destination snapshot used when the request was created.

### USER UX

Status: **IMPLEMENTED IN FEATURE BRANCH; BROWSER ACCEPTANCE PENDING**.

Includes:

- exact BEP-20 deposit warning near address/QR;
- required My Profile withdrawal-address flow with lock status;
- withdrawal page using saved profile address;
- permanent `How FixTradeZone Works` page/sidebar link;
- first-login onboarding checklist;
- persistent incomplete-profile reminder;
- dashboard `Getting Started — x/5 completed` using real state.

The existing protected-portal layout/design is locked. Do not redesign global layout, dashboard columns, sidebar dimensions or global typography merely for this feature.

## Project-specific delivery order — LOCKED

For FixTradeZone, use this sequence for every module/API slice:

1. verify branch / HEAD / git status / migration status;
2. backend + matching frontend/BFF implementation together;
3. repository CI/build/lint/typecheck/tests;
4. pull the green checkpoint locally;
5. apply reviewed forward migrations with `prisma migrate deploy` only;
6. local Postman/API acceptance first;
7. browser/UI acceptance after API acceptance;
8. SQL/ledger/readback proof for financial modules;
9. docs + commit + push;
10. PR to `main` only after all local gates are green and Founder approval is explicit.

Do not repeat completed modules/tests unless a new failure requires targeted diagnosis.

## Permanent technical locks

- MySQL only; never MongoDB.
- Never `prisma migrate dev`.
- Never reset the application database to bypass migration problems.
- Applied migrations are immutable; fixes are forward-only.
- `backups/` must never be touched, added, deleted, stashed or committed.
- Backend is authoritative for security, business and financial rules.
- Browser code uses same-origin BFF/HttpOnly session transport; do not expose NestJS bearer/refresh tokens to browser JavaScript.
- Financial/accounting history is immutable and auditable.
- UTC remains the operational platform-time standard unless a stored business timezone snapshot is part of the contract.
- Do not run `pm2 save` unless explicitly approved.

## Next session starting point

Do not reopen trading design work by default; the requested trading implementation changes are done. Start from repository/CI verification, then prepare one local pull checkpoint.

After pull, test in this order:

1. migration status and `0045`/`0046` deployment if required;
2. Postman: Daily Trade first -> matching canonical Internal Trade -> no duplicate settlement;
3. Postman: profile required fields, first BEP-20 address save, 30-day lock/change rejection, payout bound to saved address;
4. browser: profile, deposit warning, withdrawal, onboarding, How It Works, Getting Started;
5. SQL/ledger/readback proof;
6. final milestone gate and PR preparation only when green.
