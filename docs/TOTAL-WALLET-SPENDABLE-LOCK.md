# TOTAL-WALLET-01 — Payout Spendable Balance Lock

Status: **IMPLEMENTED / LOCAL ACCEPTANCE IN PROGRESS**.

## Final business lock

Total Wallet is the authoritative spendable balance for **USER payouts only**.

```text
Payout           → Total Wallet ONLY
Package Purchase → original Deposit / TXID flow
```

Package purchase is not a direct Total Wallet purchase path. The existing package flow remains:

```text
Published package plan/item
→ USER creates the package-specific deposit
→ USER submits the public network TXID
→ authorized deposit review approves the payment
→ approved-deposit accounting credits USER Main / Deposit
→ SUB-02 package activation consumes the approved package principal
```

## Payout accounting

For a new payout request, the only USER spend source is `TOTAL_WALLET`.

The four component balances retain their accounting/classification meaning:

- `MAIN`
- `PACKAGE_EARNINGS`
- `REFERRAL_COMMISSION`
- `REWARDS`

A payout reserve/release must not rewrite those four component balances.

Current Total Wallet value is derived from the four USER component balances plus immutable Total-Wallet-only adjustment events.

Example:

```text
Before payout:
Main / Deposit        10
Package Earnings       4
Referral Commission    3
Rewards                2
Total Wallet           19

Reserve payout 12:
Main / Deposit        10   unchanged
Package Earnings       4   unchanged
Referral Commission    3   unchanged
Rewards                2   unchanged
Total Wallet            7
```

A rejected/cancelled payout restores the corresponding Total Wallet reserve exactly once. A completed payout does not restore it.

## Package purchase remains deposit-backed

TOTAL-WALLET-01 does not replace the established package payment/activation chain.

Approved-deposit accounting first posts:

```text
DEBIT   SYSTEM:DEPOSIT_CLEARING:<currency>
CREDIT  USER:<userId>:MAIN:<currency>
```

Package activation then posts the exact approved package principal:

```text
DEBIT   USER:<userId>:MAIN:<currency>
CREDIT  SYSTEM:PACKAGE_PRINCIPAL:<currency>
```

The package subscription retains its immutable `sourceDepositId` and `sourceDepositAccountingTransactionId` lineage. There is no USER-facing direct package-purchase endpoint funded from Total Wallet.

## Migration correction boundary

Migration `0039_total_wallet_spendable_balance` introduced the payout Total Wallet projection and payout policy support. Migration `0040_total_wallet_package_purchase` was applied during pre-acceptance work but represented an incorrect package-purchase interpretation.

Applied migrations are never rewritten or deleted. `0041_restore_deposit_package_purchase` is the forward-only correction that restores the original deposit-backed package schema and removes the pre-acceptance direct-wallet package-purchase fields.

If any direct Total-Wallet package row exists, `0041` fails closed on the restored NOT NULL deposit lineage instead of deleting or rewriting financial history.

## Acceptance requirements

Before merge, local evidence must prove:

1. payout policy exposes only `Total Wallet` as the new payout source;
2. a payout reserve decreases Total Wallet by the exact reserved amount;
3. `MAIN`, `PACKAGE_EARNINGS`, `REFERRAL_COMMISSION`, and `REWARDS` remain unchanged by payout reserve/release;
4. payout overdraw is rejected atomically;
5. rejected payout restores the reserve exactly once;
6. package selection still routes to the original Deposit/TXID flow;
7. package activation still requires approved-deposit accounting and immutable deposit lineage;
8. package activation still consumes USER Main / Deposit into SYSTEM Package Principal;
9. no direct `Purchase from Total Wallet` package UI/API remains;
10. financial ledger/event writes remain balanced, immutable and idempotent.

## History rule

Legacy payout source snapshots and all existing package/deposit/ledger history remain immutable. This correction changes only the forward behavior after the correction boundary.
