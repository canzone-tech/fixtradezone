# TOTAL-WALLET-01 — Authoritative Spendable Balance Lock

Status: **LOCKED**

## Business invariant

`Total Wallet` is the USER's authoritative spendable balance.

The existing component balances remain independent source/accounting balances:

- `MAIN` / Main / Deposit
- `PACKAGE_EARNINGS`
- `REFERRAL_COMMISSION`
- `REWARDS`

Neither payout nor package purchase/activation debits or rewrites any of those four component balances.

The only spendable source for both operations is `Total Wallet`.

Example:

```text
Before spend
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

If a package purchase of 5 follows:

```text
After package purchase
Main / Deposit       10
Package Earnings      4
Referral Commission   3
Rewards               2
Total Wallet           2
```

## Package funding invariant

Package purchase/activation is funded from `TOTAL_WALLET` only.

`MAIN`, `PACKAGE_EARNINGS`, `REFERRAL_COMMISSION`, and `REWARDS` are never selected, checked, debited, consumed, or rewritten as package-purchase funding sources.

A successful package activation:

1. verifies authoritative Total Wallet has at least the required package amount;
2. posts one immutable Total Wallet `DEBIT` event for that amount;
3. records a balanced package-principal ledger transaction through the system Total Wallet control account;
4. leaves all four component balances unchanged.

If authoritative Total Wallet is insufficient, package funding fails closed and no subscription or financial write may partially commit.

## Posting model

Future USER component-ledger entries mirror their economic effect into the immutable Total Wallet event stream when those component events represent incoming/outgoing economic value:

- component `CREDIT` -> Total Wallet `CREDIT`
- component `DEBIT` -> Total Wallet `DEBIT`

That synchronization never makes a component bucket independently spendable.

Payout accounting and package-purchase accounting do not post debits against component USER ledger accounts. They debit authoritative Total Wallet directly and use balanced system control accounting for the related financial transaction.

A rejected payout restores Total Wallet only. A completed payout leaves the earlier Total Wallet reserve consumed.

Package purchase has no component-bucket debit to restore because component balances were never spent.

## Historical safety

- Existing component ledger entries are immutable.
- Existing package activations retain their historical ledger/accounting records.
- Existing payout requests retain their historical source-bucket snapshot.
- Existing migrations remain immutable once applied; implementation is forward-only.
- Migration opening balance is initialized from the currently available sum of the four component balances once, at migration time.
- Legacy payout requests may finish/reject under their historical accounting path.
- New package activations after TOTAL-WALLET-01 use Total Wallet only.

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
6. Package purchase/activation decreases Total Wallet only.
7. `MAIN`, `PACKAGE_EARNINGS`, `REFERRAL_COMMISSION`, and `REWARDS` remain unchanged by package purchase.
8. Package activation fails atomically when Total Wallet is insufficient.
9. Double-spend between payout reserve and package funding is rejected atomically.
10. Ledger transactions remain balanced and Total Wallet events are immutable/idempotent.
