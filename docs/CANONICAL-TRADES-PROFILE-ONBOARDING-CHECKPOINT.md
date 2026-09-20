# FixTradeZone — Canonical Trades / Profile / Onboarding Checkpoint

Checkpoint date: 2026-09-20

This document is the handoff source for continuing this feature in a new chat/session. Repository code plus `/docs` remain the permanent source of truth.

## Repository checkpoint

- Repository: `canzone-tech/fixtradezone`
- Base/main at feature start: `4c748968c5553dae42415010a9757f1589cc2883`
- Feature branch: `feature/canonical-trades-profile-onboarding`
- Implementation head before this documentation sync: `ddebba99d6e53581cbfe6a79b1a1b76b8fdb1c0e`
- MySQL only. Never MongoDB.
- `backups/` must never be touched, added, deleted, stashed or committed.
- Never use `prisma migrate dev` or reset the application database. Forward migrations only with `prisma migrate deploy`.
- PR to `main` only after local API/Postman, browser/UI and required SQL/ledger/readback acceptance are green and Founder approval is explicit.

## FixTradeZone project-specific delivery workflow — LOCKED

This project intentionally uses this local acceptance order even where a generic delivery document says frontend-first:

1. confirm branch, HEAD, status and migrations;
2. implement backend + matching frontend/BFF for one vertical slice;
3. run repository/CI code gates;
4. pull the green repository checkpoint locally;
5. apply required forward migrations with `prisma migrate deploy`;
6. test backend/module APIs locally in Postman first;
7. only after API acceptance, test the browser/UI flow;
8. for financial modules, prove SQL/ledger/readback and immutable history;
9. update `/docs`, commit and push;
10. raise PR to `main` only after all local gates are green.

Do not repeat already accepted modules unless a new failure requires a targeted retest. Stop on the first failing layer and fix the real cause. Do not bypass validation, CI, migration or accounting guards.

## Development pattern — LOCKED

- NestJS backend owns business/security/financial truth.
- Next.js BFF owns same-origin browser transport and HttpOnly-cookie session forwarding; browser code must not receive NestJS bearer/refresh tokens.
- React UI mirrors backend rules for UX but never replaces server enforcement.
- Prisma/MySQL is the relational/business/accounting source of truth.
- Financial/accounting writes are transactional, idempotent where required, auditable and forward-only.
- Historical financial/trade facts are immutable; corrections are explicit forward facts, never silent rewrites.
- UTC remains the platform operational timestamp standard unless a stored business timezone snapshot is explicitly part of the contract.
- Reuse existing service/module/DTO/validation patterns instead of creating parallel architecture.
- Shared UI tokens and shared form/feedback primitives are preferred. Do not create a new visual system for one page.

## Visual/design lock — DO NOT REDESIGN AGAIN

The protected portal visual baseline already exists and must not be casually changed again.

- `admin/src/styles/universal-ui.scss` is the Founder-locked protected-portal surface authority.
- `admin/src/styles/fixtradezone-readability.scss` is the shared minimum readability layer.
- Existing USER shell/sidebar/topbar/dashboard layout is preserved.
- New pages/components may add only the layout needed for their feature while inheriting the locked navy/cyan/teal surface language, spacing, radius, border and control system.
- Do not make global layout/alignment overrides merely to fit a new card/component.
- Do not change dashboard columns, sidebar dimensions, global page width or global typography unless separately approved.
- Profile, onboarding, How It Works, deposit warning and payout UI must fit the existing product design rather than redefine it.

## Trading canonicalization — IMPLEMENTATION COMPLETE IN FEATURE BRANCH

Trading changes requested for this scope are considered implementation-complete on the feature branch. Local acceptance is still required after the approved pull checkpoint.

Canonical rule:

`Daily Trade = immutable source identity/result -> Internal Trading = financial interpretation/settlement`

Locked behavior:

- Daily Trade is generated, persisted and displayed first.
- Internal Trading may process a normal financial trade only when the matching Daily Trade already exists.
- Canonical identity copied unchanged into Internal Trading includes subscription, user/package linkage, local date, slot, scheduled time, timezone snapshot, asset, WIN/LOSS and raw result percentage.
- One canonical Daily Trade can back at most one matching normal Internal Trade.
- No canonical Daily Trade means no new canonical normal financial trade.
- Internal Trading must not independently reroll/recalculate schedule, asset, outcome or raw result for canonical normal trades.
- Daily Trade generation remains display-only and has no direct wallet/ledger/commission/reward effect.
- Settlement, package progress, caps and USER/ADMIN split remain Internal Trading responsibilities.
- Financial applied amounts may be capped/adjusted without changing the canonical raw result or identity.
- Existing legacy Internal Trading history is preserved. Cutover is forward-only.
- Existing legacy day continuation is allowed only to finish already-started legacy days safely; mixed legacy/canonical rows for the same in-progress day are rejected.
- `TARGET_RECONCILIATION` remains an explicit financial closure type and is not represented as a new independently generated Daily Trade identity.

Key implementation:

- `backend/src/internal-trading/canonical-internal-trading-trade.service.ts`
- `backend/src/internal-trading/internal-trading.module.ts` binds `InternalTradingTradeService` to the canonical implementation.
- `backend/prisma/migrations/0045_canonical_daily_trade_financial_link/migration.sql`
- Canonical linkage uses `simulatedActivityEventId` / Daily Trade source linkage with uniqueness protection for forward 1:1 processing.

### Trading/Daily Trade backend endpoints relevant to local Postman

USER/read:

- `GET /simulated-activity/me`
- `GET /internal-trading/me/packages`
- `GET /internal-trading/me/packages/:subscriptionId`
- `GET /internal-trading/me/packages/:subscriptionId/events`

ADMIN/SUPER_ADMIN Daily Trade operations:

- `GET /admin/simulated-activity/policies`
- `POST /admin/simulated-activity/policies/drafts`
- `POST /admin/simulated-activity/policies/drafts/initial`
- `GET /admin/simulated-activity/policies/:policyVersionId`
- `PATCH /admin/simulated-activity/policies/:policyVersionId`
- `POST /admin/simulated-activity/policies/:policyVersionId/publish`
- `GET /admin/simulated-activity/events`
- `GET /admin/simulated-activity/reconciliation`
- `GET /admin/simulated-activity/worker-health`
- `POST /admin/simulated-activity/process-due`
- `POST /admin/subscriptions/:subscriptionId/process-simulated-activity`

ADMIN/SUPER_ADMIN Internal Trading operations:

- `GET /admin/internal-trading/workspace`
- `GET /admin/internal-trading/subscriptions/:subscriptionId/events`
- `GET /admin/internal-trading/worker-health`
- `POST /admin/internal-trading/subscriptions/:subscriptionId/reconcile-trades`

Postman acceptance must prove that the Daily Trade exists first and the resulting Internal Trade uses the same canonical local date, slot, scheduled time, asset, outcome and raw result percentage with the expected source linkage and no duplicate normal settlement.

## Profile + saved withdrawal wallet — IMPLEMENTED IN FEATURE BRANCH

Required profile fields:

- First name
- Last name
- Country code + mobile number
- `USDT Withdrawal Wallet Address — BNB Smart Chain (BEP-20)`

Profile completion is false while any required field is missing.

Withdrawal wallet rules:

- First save is allowed for users without a saved address.
- Saved withdrawal address is profile-domain state, not a per-payout free-text destination.
- Address validation is server-side EVM/BEP-20-compatible validation.
- First save starts a 30-day change lock.
- Each successful later change, after the current lock expires, starts a new 30-day lock.
- During the lock the server rejects a different address.
- Concurrency/revision protection prevents simultaneous updates from silently replacing each other.
- Initial save/change is audited.
- No admin/superadmin silent bypass exists in this scope.
- No fake historical backfill for users who never saved an address.

Migration:

- `backend/prisma/migrations/0046_user_withdrawal_profile/migration.sql`
- persistence table: `user_withdrawal_profiles`

Backend endpoints:

- `GET /auth/me/profile` — current profile completion + saved withdrawal metadata
- `PATCH /auth/me/profile` — update first name, last name, E.164 phone and/or saved withdrawal address

Same-origin browser route:

- `GET /api/user/session` — USER session plus profile-completion data
- `PATCH /api/user/session` — USER profile update transport to the backend profile endpoint

## Payout binding — IMPLEMENTED IN FEATURE BRANCH

Server authority:

- USER payout creation is bound to `user_withdrawal_profiles.destinationAddress`.
- A payout request stores the destination snapshot used at creation and history does not change when the profile address later changes.
- Missing saved address blocks payout creation.
- Saved profile asset/network/validation metadata must remain `USDT` / `BEP20` / `EVM`.
- A submitted address that does not match the saved profile address is rejected; the server still uses the saved profile value as authoritative.
- Payout policy/accounting validation remains in the existing payout service chain.

Backend endpoints relevant to local Postman:

- `GET /payouts/policy`
- `GET /payouts/me`
- `POST /payouts`
- `POST /payouts/reinvest`

USER browser/BFF routes mirror these under `/api/user/payouts...`.

## Deposit BEP-20 warning — IMPLEMENTED IN FEATURE BRANCH

For BEP-20 deposits, the UI shows the clear network label:

`USDT — BNB Smart Chain (BEP-20)`

and the exact warning immediately below the address/QR area:

`Send only USDT on BNB Smart Chain (BEP-20) to this address. Anything sent on another network, or in another token, is lost and cannot be recovered.`

This warning must remain prominent on desktop and mobile and must not be visually separated far away from the address/QR/copy action.

## USER onboarding/help — IMPLEMENTED IN FEATURE BRANCH

- Permanent sidebar link: `How FixTradeZone Works`.
- User flow explanation: Deposit -> Package -> Daily Trades -> Trading/Earnings -> Wallet -> Withdraw.
- Copy explicitly states that Daily Trades appear first and Internal Trading is the financial interpretation/settlement layer.
- Generated Daily Trade activity must not be described as exchange/broker execution.
- First-login onboarding title: `Welcome to FixTradeZone`.
- Checklist state is real, not hard-coded: email verified, personal profile details, withdrawal address, first approved deposit, first active package.
- Incomplete profile gets a persistent reminder/banner.
- Dashboard `Getting Started — x/5 completed` remains until complete, then disappears.
- Dismissing onboarding does not block normal navigation and does not mutate business state.

## Current feature files of interest

Backend:

- `backend/src/internal-trading/canonical-internal-trading-trade.service.ts`
- `backend/src/internal-trading/internal-trading.module.ts`
- `backend/src/auth/own-profile.service.ts`
- `backend/src/auth/own-profile.controller.ts`
- `backend/src/auth/dto/update-own-profile.dto.ts`
- `backend/src/payouts/profile-bound-payouts.service.ts`
- `backend/src/payouts/payouts.module.ts`
- migrations `0045` and `0046`

Admin/USER app:

- `admin/src/app/user/profile/profile-client.tsx`
- `admin/src/app/user/profile/profile.module.css`
- `admin/src/app/user/payouts/user-payouts-client.tsx`
- `admin/src/app/user/deposits/user-deposits-client.tsx`
- `admin/src/app/user/how-it-works/*`
- `admin/src/components/user/user-setup-guide.tsx`
- `admin/src/components/user/user-setup-guide.module.css`
- `admin/src/components/user/user-sidebar.tsx`
- `admin/src/components/user/user-shell.tsx`
- `admin/src/lib/user-session.ts`

## New-chat continuation order

Do not redesign the portal again. Do not reopen canonical trading implementation unless local acceptance exposes a concrete defect.

Start the next chat from the repository checkpoint, verify branch HEAD/CI, then prepare one local pull checkpoint. After pull:

1. verify migrations/status;
2. apply `0045` and `0046` only through `prisma migrate deploy` if not already applied;
3. local Postman acceptance for canonical Daily Trade -> Internal Trading first;
4. local Postman acceptance for profile/address lock and payout binding;
5. browser acceptance for profile, deposit warning, withdrawal, onboarding, How It Works and dashboard progress;
6. SQL/ledger/readback proof for canonical trade settlement and payout destination snapshots;
7. update docs/checkpoint and only then prepare the PR.
