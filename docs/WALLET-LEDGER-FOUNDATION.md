# WAL-01 — Wallet / Ledger Foundation

Status: **CONTRACT LOCKED / IMPLEMENTATION IN PROGRESS**.

## Purpose

WAL-01 introduces the first accounting source of truth for FixTradeZone. It converts an approved deposit payment fact into an immutable, balanced accounting transaction and exposes a USER wallet read model plus an ADMIN accounting view.

WAL-01 does **not** activate packages, calculate referral commission, create rewards, process withdrawals, or represent simulated activity as money.

## Wallet product model — LOCKED

The USER sees one Wallet composed from accounting buckets rather than unrelated wallet systems.

```text
Main / Deposit Balance
Package Earnings
Referral Commission
Rewards
---------------------
Total Wallet
```

The backend does not store `totalWallet` as an independently editable balance. Total Wallet is derived from posted ledger-account balances.

WAL-01 posts only the **Main / Deposit** bucket. The other buckets are created as first-class account types so later milestones can post into them without redesigning the wallet foundation:

- `MAIN` — approved deposit / principal funds;
- `PACKAGE_EARNINGS` — later package lifecycle earnings;
- `REFERRAL_COMMISSION` — later legitimate referral commission events;
- `REWARDS` — later approved reward/bonus events.

`Simulated Trade Activity` is never a wallet bucket and never creates ledger money. FixTradeZone v1 has no real trading engine.

Future availability controls may derive `Available` and `Locked/Pending` views from ledger/hold accounting. WAL-01 does not invent withdrawability rules before the withdrawal milestone.

## Core accounting rules

1. MySQL remains the accounting source of truth.
2. Every posted financial event is represented by one immutable ledger transaction with balanced debit/credit entries.
3. Financial amounts use `DECIMAL`; never FLOAT/DOUBLE.
4. A deposit can create accounting value only when its status is `APPROVED`.
5. Deposit-to-ledger posting is idempotent. One approved deposit can map to at most one accounting transaction.
6. Future approval flows post accounting atomically with approval where possible; already-approved DEP-01 records can be reconciled through the same idempotent posting service.
7. User wallet balance is a read model maintained from immutable ledger entries inside the same database transaction.
8. Negative USER bucket balance is not permitted by WAL-01.
9. Ledger rows are never edited or deleted to correct history. Future corrections use linked reversal/adjustment transactions.
10. No arbitrary ADMIN balance editing exists in WAL-01.
11. Every posted transaction must contain total DEBIT == total CREDIT for the same currency.
12. A balance read model may be rebuilt from immutable ledger entries; it is not a substitute accounting source of truth.

## Account model

The ledger uses typed accounts rather than storing loose balance columns on `users`.

### USER wallet accounts

One account per USER + currency + wallet bucket.

Examples:

```text
USER:<userId>:MAIN:USDT
USER:<userId>:PACKAGE_EARNINGS:USDT
USER:<userId>:REFERRAL_COMMISSION:USDT
USER:<userId>:REWARDS:USDT
```

USER wallet accounts have normal balance `CREDIT`.

### Deposit clearing account

One SYSTEM clearing account per currency.

Example:

```text
SYSTEM:DEPOSIT_CLEARING:USDT
```

Normal balance: `DEBIT`.

A deposit credit creates the matching DEBIT entry here.

## Deposit posting

For an approved deposit of `50 USDT`:

```text
LedgerTransaction(kind=DEPOSIT_CREDIT, sourceKey=DEPOSIT:<depositId>:CREDIT)

DEBIT   SYSTEM:DEPOSIT_CLEARING:USDT   50
CREDIT  USER:<userId>:MAIN:USDT        50
```

The transaction is valid only if total debits equal total credits exactly.

## Idempotency

`ledger_transactions.sourceKey` is unique.

For deposit posting:

```text
DEPOSIT:<depositId>:CREDIT
```

Repeated posting requests return the existing transaction and do not create a second credit.

No package activation, commission or reward event reuses this source key. Each later accounting event must define its own deterministic idempotency key.

## Concurrency

Posting runs in a serializable database transaction.

The service must protect against:

- duplicate posting of the same deposit;
- concurrent first creation of USER or SYSTEM ledger accounts;
- stale balance revisions;
- partial ledger transactions;
- deposit status changing during posting.

A ledger transaction is considered posted only after both entries and affected account-balance read models are committed together.

## WAL-01 API surface

### USER

- `GET /wallet/me`
  - Total Wallet by currency;
  - bucket balances;
  - recent immutable ledger activity.

### ADMIN

- `GET /admin/wallets`
  - paginated USER wallet bucket/balance read model.
- `GET /admin/ledger`
  - paginated accounting transactions.
- `GET /admin/ledger/:transactionId`
  - transaction + balanced entries.
- `POST /admin/deposits/:depositId/post-accounting`
  - reconciliation/posting endpoint for an already-approved deposit;
  - idempotent;
  - does not activate package/referral/reward logic.

Future deposit approvals call the same posting service rather than implement a second credit path.

## Permissions

- `wallets.read` — view USER wallet balances in ADMIN.
- `ledger.read` — view accounting transactions/entries.
- `ledger.post` — reconcile/post an eligible approved deposit.

SUPER_ADMIN retains permission bypass according to the existing RBAC contract.

## Frontend acceptance surface

### USER `/user/wallet`

- Total Wallet;
- Main / Deposit Balance;
- Package Earnings;
- Referral Commission;
- Rewards;
- currency;
- recent ledger history;
- deposit-credit description/source;
- no fake withdrawable/trading-profit language.

Buckets not yet implemented by their business milestone display zero and are clearly described as accounting categories, not earned balances.

### ADMIN `/wallets`

- USER wallet totals and bucket balances;
- ledger activity;
- approved deposits that are not yet posted can be reconciled through controlled action;
- all operation feedback uses the shared right-side `FlashMessage` pattern.

## Deferred

WAL-01 deliberately excludes:

- package subscription/activation;
- package earning calculation/posting;
- referral commission posting;
- reward/cap accounting;
- withdrawal/payout;
- arbitrary ADMIN adjustment endpoint;
- blockchain custody/signing;
- automatic chain verification;
- simulated activity as financial value.

Those features must consume the ledger foundation through their own later milestones.

## Acceptance order

1. backend + frontend implementation complete;
2. automated backend/admin CI green;
3. migration apply/status green;
4. frontend-first ADMIN/USER acceptance cases;
5. direct API/Postman only if a UI/business function needs isolation;
6. SQL/ledger balancing/audit readback;
7. final milestone verification;
8. Founder acceptance;
9. PR only after explicit Founder approval.
