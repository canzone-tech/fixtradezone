# WAL-01 — Wallet / Ledger Foundation

Status: **CONTRACT LOCKED / IMPLEMENTATION IN PROGRESS**.

## Purpose

WAL-01 introduces the first accounting source of truth for FixTradeZone. It converts an approved deposit payment fact into an immutable, balanced accounting transaction and exposes a USER wallet read model plus an ADMIN accounting view.

WAL-01 does **not** activate packages, calculate referral commission, create rewards, process withdrawals, or represent simulated activity as money.

## Core accounting rules

1. MySQL remains the accounting source of truth.
2. Every posted financial event is represented by one immutable ledger transaction with balanced debit/credit entries.
3. Financial amounts use `DECIMAL`; never FLOAT/DOUBLE.
4. A deposit can create accounting value only when its status is `APPROVED`.
5. Deposit-to-ledger posting is idempotent. One approved deposit can map to at most one accounting transaction.
6. Future approval flows post accounting atomically with approval where possible; already-approved DEP-01 records can be reconciled through the same idempotent posting service.
7. User wallet balance is a read model maintained from immutable ledger entries inside the same database transaction.
8. Negative USER available balance is not permitted by WAL-01.
9. Ledger rows are never edited or deleted to correct history. Future corrections use linked reversal/adjustment transactions.
10. No arbitrary ADMIN balance editing exists in WAL-01.

## Account model

The ledger uses typed accounts rather than storing a loose `users.balance` field.

### USER wallet account

One account per USER + currency.

Example key:

```text
USER:<userId>:USDT
```

Normal balance: `CREDIT`.

A deposit credit increases this account through a CREDIT entry.

### Deposit clearing account

One SYSTEM clearing account per currency.

Example key:

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
CREDIT  USER:<userId>:USDT             50
```

The transaction is valid only if total debits equal total credits exactly.

## Idempotency

`sourceKey` is unique.

For deposit posting:

```text
DEPOSIT:<depositId>:CREDIT
```

Repeated posting requests return the existing transaction and do not create a second credit.

The deposit also stores its accounting transaction reference/timestamp after successful posting.

## Concurrency

Posting runs in a serializable database transaction.

The service must protect against:

- duplicate posting of the same deposit;
- concurrent first creation of a USER wallet account;
- stale balance revisions;
- partial ledger transactions;
- deposit status changing during posting.

A ledger transaction is considered posted only after both entries and affected account balances are committed together.

## WAL-01 API surface

### USER

- `GET /wallet/me`
  - balances by currency;
  - recent immutable ledger activity.

### ADMIN

- `GET /admin/wallets`
  - paginated USER wallet accounts / balances.
- `GET /admin/ledger`
  - paginated accounting transactions.
- `GET /admin/ledger/:transactionId`
  - transaction + balanced entries.
- `POST /admin/deposits/:depositId/post-accounting`
  - reconciliation/posting endpoint for an already-approved deposit;
  - idempotent;
  - does not activate package/referral/reward logic.

Future deposit approvals should call the same posting service rather than implement a second credit path.

## Permissions

- `wallets.read` — view USER wallet balances in ADMIN.
- `ledger.read` — view accounting transactions/entries.
- `ledger.post` — reconcile/post an eligible approved deposit.

SUPER_ADMIN retains permission bypass according to the existing RBAC contract.

## Frontend acceptance surface

### USER `/user/wallet`

- current balances;
- currency;
- recent ledger history;
- deposit-credit description/source;
- no fake withdrawable/trading-profit language.

### ADMIN `/wallets`

- USER wallet balances;
- ledger activity;
- approved deposits that are not yet posted can be reconciled through controlled action;
- all operation feedback uses the shared right-side `FlashMessage` pattern.

## Deferred

WAL-01 deliberately excludes:

- package subscription/activation;
- referral commission;
- reward/cap accounting;
- withdrawal/payout;
- arbitrary ADMIN adjustment endpoint;
- blockchain custody/signing;
- automatic chain verification;
- simulated trade/reward presentation.

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
