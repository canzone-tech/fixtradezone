# WAL-01 — Wallet / Ledger Foundation

Status: **CORE UI ACCEPTED GREEN / ACCOUNTING POLICY ENHANCEMENT IMPLEMENTED / 0011 LOCAL RE-ACCEPTANCE PENDING**.

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

The backend does not store `totalWallet` as an independently editable balance. Total Wallet is derived from posted ledger-account balances for the same currency.

WAL-01 posts only the **Main / Deposit** bucket. The other buckets are first-class account types so later milestones can post into them without redesign:

- `MAIN` — approved deposit / principal funds;
- `PACKAGE_EARNINGS` — later package lifecycle earnings;
- `REFERRAL_COMMISSION` — later legitimate referral commission events;
- `REWARDS` — later approved reward/bonus events.

`Simulated Trade Activity` is never a wallet bucket and never creates ledger money. FixTradeZone v1 has no real trading engine.

## Core accounting rules

1. MySQL remains the accounting source of truth.
2. Every posted financial event is represented by one immutable ledger transaction with balanced debit/credit entries.
3. Financial amounts use SQL `DECIMAL`; never FLOAT/DOUBLE.
4. A deposit can create accounting value only when its status is `APPROVED`.
5. Deposit-to-ledger posting is idempotent. One approved deposit maps to at most one `DEPOSIT_CREDIT` accounting transaction.
6. USER wallet balance is a transactional read model derived from immutable ledger posting.
7. Negative USER bucket balance is not permitted by WAL-01.
8. Ledger rows are never edited/deleted to correct history. Future corrections use reversal/adjustment transactions.
9. No arbitrary ADMIN balance editing exists in WAL-01.
10. Every posted transaction must contain exact total DEBIT == total CREDIT for the same currency.
11. A balance read model may be rebuilt from immutable ledger entries; it is not a substitute accounting source of truth.
12. Financial values are never aggregated across different currencies.

## Account model

One USER account exists per USER + currency + wallet bucket.

```text
USER:<userId>:MAIN:USDT
USER:<userId>:PACKAGE_EARNINGS:USDT
USER:<userId>:REFERRAL_COMMISSION:USDT
USER:<userId>:REWARDS:USDT
```

USER wallet accounts have normal balance `CREDIT`.

One SYSTEM deposit-clearing account exists per currency:

```text
SYSTEM:DEPOSIT_CLEARING:USDT
```

Normal balance: `DEBIT`.

For an approved `50 USDT` deposit:

```text
LedgerTransaction(kind=DEPOSIT_CREDIT, sourceKey=DEPOSIT:<depositId>:CREDIT)

DEBIT   SYSTEM:DEPOSIT_CLEARING:USDT   50
CREDIT  USER:<userId>:MAIN:USDT        50
```

## Idempotency and concurrency

`ledger_transactions.sourceKey` is unique. Deposit posting uses:

```text
DEPOSIT:<depositId>:CREDIT
```

Repeated reconciliation cannot create a second wallet credit.

Ledger posting runs in a serializable transaction and establishes both entries plus affected balance read models together. It protects against duplicate source events, concurrent account creation, partial ledger posting, and invalid negative balance updates.

## Deposit accounting posting policy — LOCKED

Normal operations default to:

```text
AUTO_ON_APPROVAL
```

SUPER_ADMIN may switch to:

```text
MANUAL_RECONCILIATION
```

The policy is stored in `system_accounting_config` by forward migration `0011_accounting_posting_policy` and is changed through the audited SUPER_ADMIN-only Accounting settings page.

### AUTO_ON_APPROVAL

1. Existing DEP-01 approval logic approves the deposit.
2. The approval orchestrator immediately invokes the same idempotent WAL-01 reconciliation service.
3. A successful posting credits `Main / Deposit Balance` and records the balanced ledger transaction.
4. If accounting posting fails after approval, the approved deposit remains discoverable in the existing **Accounting Pending** queue.
5. Retrying through manual reconciliation is safe because the deterministic source key prevents double credit.

This is intentionally a **recoverable orchestration boundary**, not a rewrite of the already-accepted DEP-01 approval transaction.

### MANUAL_RECONCILIATION

Deposit approval remains terminal `APPROVED`, but no wallet posting is made automatically. The approved deposit remains in **Accounting Pending** until an authorized operator uses `Post accounting`.

Manual mode is intended for QA, migration, incident recovery, and controlled operational periods. It is not the normal launch default.

### Policy-change invariants

- Only SUPER_ADMIN may change the posting policy.
- Policy updates are audited with previous/current values.
- A policy change applies to future approvals.
- Existing immutable ledger transactions are never rewritten or reposted because the policy changed.
- `Post accounting` remains an idempotent recovery/reconciliation tool in both modes.

## Migrations

### `0010_wallet_ledger_foundation`

Applied and locally verified. Creates:

- `ledger_accounts`;
- `ledger_account_balances`;
- `ledger_transactions`;
- `ledger_entries`;
- `wallets.read`, `ledger.read`, `ledger.post` permissions.

`0010` is applied history and must not be edited.

### `0011_accounting_posting_policy`

Forward migration created after `0010` local acceptance. Creates singleton `system_accounting_config` and seeds:

```text
id = 1
depositPostingMode = AUTO_ON_APPROVAL
```

Local deployment/re-acceptance of `0011` is pending until the revised code gate is GREEN.

## API surface

### USER

- `GET /wallet/me` — per-currency Total Wallet, bucket balances, immutable activity.

### ADMIN accounting

- `GET /admin/wallets`
- `GET /admin/ledger`
- `GET /admin/ledger/:transactionId`
- `GET /admin/wallets/reconciliation`
- `POST /admin/deposits/:depositId/post-accounting`

### SUPER_ADMIN policy

- `GET /admin/settings/accounting`
- `PATCH /admin/settings/accounting`

Supported posting modes:

- `AUTO_ON_APPROVAL`
- `MANUAL_RECONCILIATION`

## Frontend acceptance surface

### USER `/user/wallet`

- per-currency Total Wallet;
- Main / Deposit Balance;
- Package Earnings;
- Referral Commission;
- Rewards;
- immutable wallet activity;
- no simulated/trading-profit money.

### ADMIN `/wallets`

- USER wallet bucket balances;
- Accounting Pending queue;
- immutable ledger transactions;
- balanced DEBIT/CREDIT detail;
- manual `Post accounting` recovery action;
- shared right-side FlashMessage feedback.

### SUPER_ADMIN `/settings/accounting`

- default `Automatic on approval`;
- optional `Manual reconciliation`;
- Save/Reset;
- shared right-side FlashMessage;
- clear explanation that policy changes do not rewrite existing ledger history.

## Core acceptance already completed

Local WAL-01 core acceptance is GREEN:

- `0010_wallet_ledger_foundation` applied;
- local verification GREEN;
- Admin `/wallets` displayed exact bucket balances and balanced ledger entries;
- USER `/user/wallet` displayed matching Total/Main wallet and immutable history;
- refresh did not duplicate ledger credit;
- Package Earnings / Referral Commission / Rewards remained zero;
- Founder explicitly reported testing GREEN.

The only remaining WAL-01 acceptance work is the new configurable accounting-policy enhancement introduced after that approval.

## Deferred

WAL-01 excludes:

- package subscription/activation;
- package earning calculation/posting;
- referral commission posting;
- reward/cap accounting;
- withdrawal/payout;
- arbitrary ADMIN adjustment endpoint;
- blockchain custody/signing;
- automatic chain verification;
- simulated activity as financial value.

## Final acceptance order

1. revised backend + admin CI GREEN;
2. pull latest `feature/wallet-ledger-foundation`;
3. `verify:local` GREEN;
4. confirm only `0011_accounting_posting_policy` pending;
5. deploy `0011` and confirm DB up to date;
6. frontend-first SUPER_ADMIN Accounting settings test;
7. MANUAL approval → Accounting Pending → manual post → exact one credit;
8. AUTO approval → immediate exact one wallet credit → no pending accounting;
9. SQL/ledger/audit readback;
10. `verify:milestone` + clean working tree;
11. Founder acceptance;
12. PR only after explicit Founder approval.
