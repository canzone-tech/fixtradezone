# PKG-02 — Package Range & Lifecycle Revision

Status: **IMPLEMENTED ON FEATURE BRANCH / LOCAL ACCEPTANCE PENDING**.

Branch: `feature/package-range-lifecycle-revision`

This document records the client-approved package investment-range and lifecycle revision. Existing package/subscription/accounting architecture remains authoritative except where this document explicitly revises commercial package terms.

## Locked package catalogue

| Package | Investment range (USDT) | Duration | Principal at duration end |
| --- | ---: | ---: | --- |
| FTZ AlphaBotc | 5–24 | 10 days | Return exact invested principal |
| FTZ BullBot | 25–49 | 15 days | Return exact invested principal |
| FTZ CryptoBot | 50–99 | 20 days | Return exact invested principal |
| FTZ DynamoBot | 100–499 | 25 days | Return exact invested principal |
| FTZ EliteBot | 500–999 | 30 days | Return exact invested principal |
| FTZ JupiterBot | 1,000–1,999 | 60 days | Return exact invested principal |
| FTZ LegendBot | 2,000–3,999 | 90 days | Return exact invested principal |
| FTZ NovaBot | 4,000–4,999 | 120 days | Return exact invested principal |
| FTZ PrimeBot | 5,000–Unlimited | 150 days | **NO CAPITAL RETURN** |

The user chooses the exact investment amount inside the selected package range. Package eligibility is not a fixed-price purchase anymore for the revised catalogue.

## Immutable investment snapshot

A range-based deposit snapshots the commercial terms that were authoritative when the investment request was created, including:

- selected package plan/item identity;
- exact requested investment amount;
- package minimum investment;
- package maximum investment, nullable for an unlimited upper bound;
- package duration days;
- principal treatment;
- currency and existing package-policy snapshots.

Activation revalidates the immutable deposit snapshot against the source package item before moving principal or creating the subscription. A changed future package plan therefore cannot reinterpret an already-created deposit.

The resulting subscription keeps the exact actual investment amount as `price`/principal and stores the range/lifecycle snapshot required for later readback and completion.

## Activation accounting

The existing WAL-01 / SUB-02 accounting boundary remains unchanged except that the amount is the exact user-selected investment inside the immutable range.

```text
DEBIT   USER:<userId>:MAIN:<currency>          <exact invested amount>
CREDIT  SYSTEM:PACKAGE_PRINCIPAL:<currency>    <exact invested amount>
```

The package funding transaction remains `PACKAGE_ACTIVATION_FUNDING` and remains idempotent by the existing deposit-derived source key.

## Multiple active subscriptions

When the published plan uses `MULTIPLE_ACTIVE`, each successful package activation is an independent subscription. There is no user-level pooling of principal, duration, trade state, or return accounting.

Each ACTIVE internal-trading subscription independently receives its configured daily trade lifecycle. The current trading architecture therefore continues to treat three active subscriptions as three separate package states rather than one combined investment.

## Duration completion

Internal trading remains the lifecycle authority for the package's trading completion boundary. When the final required trading slot reaches `TARGET_REACHED_AT_DURATION_END`, the internal-trading state becomes `COMPLETED`.

Package completion then finalizes the corresponding `user_package_subscriptions` row. The completion service is called from:

- authorized admin trade reconciliation; and
- the internal-trading worker.

The worker also scans completed trading states whose package subscription is still ACTIVE, providing recovery if a process stops after trading completion but before package completion is finalized.

## Exact principal return — AlphaBotc through NovaBot

For subscriptions whose immutable principal treatment is `RETURN_SEPARATELY`, completion returns the exact actual invested principal to USER Main.

Ledger source key:

```text
SUBSCRIPTION:<subscriptionId>:PRINCIPAL_RETURN
```

Ledger kind:

```text
PACKAGE_PRINCIPAL_RETURN
```

Double-entry posting:

```text
DEBIT   SYSTEM:PACKAGE_PRINCIPAL:<currency>    <exact invested principal>
CREDIT  USER:<userId>:MAIN:<currency>          <exact invested principal>
```

The service verifies that the subscription principal equals the internal-trading lifecycle principal, requires the expected ledger-account semantics, writes exactly two return entries, verifies the exact debit/credit amount, updates balance read models inside the same serializable transaction, and writes audit records.

The deterministic source key makes the return idempotent. A retry validates an existing return transaction instead of moving principal again.

Principal return is principal, not package profit or another earning bucket.

## PrimeBot

`FTZ PrimeBot` snapshots `NON_REFUNDABLE_PACKAGE_VALUE`.

At successful duration completion:

- the package subscription becomes `COMPLETED`;
- no `PACKAGE_PRINCIPAL_RETURN` transaction is created;
- no principal credit is posted back to USER Main.

This is the explicit client-approved **NO CAPITAL RETURN** rule.

## Forward migrations

This revision uses forward-only MySQL migrations:

- `0023_package_range_lifecycle_revision`
- `0024_package_principal_return_accounting`

`0024` only extends the existing `ledger_transactions.kind` enum with `PACKAGE_PRINCIPAL_RETURN`. Existing migrations remain immutable.

Apply locally only with:

```bash
npx prisma migrate deploy
```

Never use `prisma migrate dev` or reset the database for this project.

## Acceptance gates

Before PR to `main`, local acceptance must prove:

1. backend Prisma generate/validate, lint, tests and build are GREEN;
2. admin lint, typecheck and build are GREEN;
3. migrations `0023` and `0024` deploy successfully to local MySQL;
4. browser UI accepts an amount inside a package range and rejects values outside it;
5. activated subscription readback preserves exact amount/range/duration/principal treatment;
6. multiple active packages remain independent when the plan permits them;
7. a returnable package completion produces one balanced `PACKAGE_PRINCIPAL_RETURN` for the exact invested principal;
8. retry does not create duplicate return transactions, entries, or balance movement;
9. PrimeBot completion produces no principal-return transaction or USER Main principal credit;
10. financial SQL/ledger readback matches the immutable subscription and audit records.

Postman is used only if browser/API behavior is doubtful under the current project acceptance workflow.

## PR gate

No PR to `main` is authorized from implementation/CI alone. Local build gates, browser acceptance and financial SQL/ledger proof must be GREEN first.
