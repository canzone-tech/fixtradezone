# TOTAL-WALLET-01 — Authoritative Spendable Balance Lock

Status: **LOCKED**

## Business invariant

`Total Wallet` is the USER's authoritative spendable balance.

The existing component balances remain independent source/accounting balances:

- `MAIN` / Main / Deposit
- `PACKAGE_EARNINGS`
- `REFERRAL_COMMISSION`
- `REWARDS`

A payout changes **Total Wallet only**. It must not debit or rewrite any of the four component balances.

Example:

```text
Before payout
Main / Deposit       10
Package Earnings      4
Referral Commission   3
Rewards               2
Total Wallet          19

Payout reserve        12

After payout
Main / Deposit       10
Package Earnings      4
Referral Commission   3
Rewards               2
Total Wallet           7
```

## Package funding invariant

Package purchase/activation remains eligible from `MAIN` / Main / Deposit only.

Because Total Wallet is the authoritative spendable balance, a successful MAIN-funded package debit must also reduce Total Wallet by the same amount. This prevents the same economic value from being spent once by payout and again by package activation.

If either MAIN eligibility/balance or authoritative Total Wallet spendable balance is insufficient, package funding must fail closed.

## Posting model

Future USER component-ledger entries mirror their economic effect into an immutable Total Wallet event stream:

- component `CREDIT` -> Total Wallet `CREDIT`
- component `DEBIT` -> Total Wallet `DEBIT`

This synchronization changes Total Wallet but does not alter the other component balances beyond the original component ledger posting itself.

Payout accounting does not post against component USER ledger accounts. It reserves directly from authoritative Total Wallet and records a balanced system control/reserve transaction.

A rejected payout restores Total Wallet only. A completed payout leaves the earlier Total Wallet reserve consumed.

## Historical safety

- Existing component ledger entries are immutable.
- Existing payout requests retain their historical source-bucket snapshot.
- Existing migrations are immutable; implementation is forward-only.
- Migration opening balance is initialized from the currently available sum of the four component balances once, at migration time.
- Legacy payout requests may finish/reject under their historical accounting path.

## Payout policy

For new USER payouts, the only configurable source is `TOTAL_WALLET`.

Component payout sources are historical-only and must not be selectable for new payout requests.

## Acceptance proof

Local acceptance must prove all of the following:

1. Total Wallet is stored/read independently from the four component balances.
2. New payout reserve decreases Total Wallet only.
3. Component balances are unchanged by payout reserve, rejection, and completion.
4. Rejection restores exactly the reserved Total Wallet amount.
5. Payout cannot reserve more than Total Wallet.
6. Package activation remains MAIN-only and also decreases Total Wallet.
7. Double-spend between payout reserve and package funding is rejected atomically.
8. Ledger transactions remain balanced and Total Wallet events are immutable/idempotent.
