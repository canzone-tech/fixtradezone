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

## Authoritative projection

`Total Wallet` is not a fifth USER source ledger bucket.

Its current spendable value is the live source-balance sum plus immutable Total-Wallet-only adjustments:

```text
Total Wallet
= MAIN
+ PACKAGE_EARNINGS
+ REFERRAL_COMMISSION
+ REWARDS
+ Total-Wallet-only CREDIT events
- Total-Wallet-only DEBIT events
```

The database exposes this read model through `user_total_wallet_balances` and stores the spend/release adjustments in `user_total_wallet_events`.

This design is intentionally **trigger-free**. It does not require MySQL `SUPER`, stored-function privileges, or `log_bin_trust_function_creators`. A normal component credit automatically changes Total Wallet because the projection reads the current component balances directly; it does not need a second mirrored Total Wallet credit.

## Package funding invariant

Package purchase/activation is funded from `TOTAL_WALLET` only.

`MAIN`, `PACKAGE_EARNINGS`, `REFERRAL_COMMISSION`, and `REWARDS` are never selected, checked, debited, consumed, or rewritten as package-purchase funding sources.

A successful package activation:

1. locks the USER/source-balance accounting boundary and verifies current Total Wallet has at least the required package amount;
2. posts one immutable Total Wallet `DEBIT` event for that amount;
3. records a balanced package-principal ledger transaction through the system Total Wallet control account;
4. leaves all four component balances unchanged.

If authoritative Total Wallet is insufficient, package funding fails closed and no subscription or financial write may partially commit.

## Payout posting model

New payout reserve accounting does not debit a component USER ledger account. It:

1. validates available Total Wallet under the same serialized accounting boundary;
2. posts an immutable Total Wallet `DEBIT` adjustment event;
3. records the balanced reserve transaction through the system Total Wallet control account.

A rejected payout posts the matching Total Wallet `CREDIT` adjustment and releases the reserve. A completed payout leaves the original reserve debit consumed.

## Source component events

Future source-ledger credits and debits keep their own historical/accounting meaning and are **not duplicated** into `user_total_wallet_events`.

Examples include deposit credits, package earnings, referral commissions, rewards and historical component-ledger lifecycle events. Because Total Wallet reads the live component balances, their economic effect is already included exactly once.

Only economic actions that intentionally change spendable Total Wallet **without changing a component balance** create `user_total_wallet_events`, including:

- new payout reserve (`DEBIT`);
- payout rejection/release (`CREDIT`);
- new package purchase/activation (`DEBIT`).

## Historical and migration safety

- Existing component ledger entries remain immutable.
- Existing package activations retain their historical ledger/accounting records.
- Existing payout requests retain their historical source-bucket snapshot.
- Legacy payout requests may finish/reject under their historical accounting path.
- New package activations after TOTAL-WALLET-01 use Total Wallet only.
- Production/applied migrations are never rewritten.
- The pre-acceptance `0039_total_wallet_spendable_balance` migration may be repaired while it is still failed/unreleased; recovery must mark that failed attempt **rolled back**, never applied, before rerunning the corrected forward migration.
- The corrected `0039` removes only its own partially-created pre-acceptance Total Wallet projection objects before rebuilding them; it does not reset or rewrite existing ledger/history data.

## Payout policy

For new USER payouts, the only configurable source is `TOTAL_WALLET`.

Component payout sources are historical-only and must not be selectable for new payout requests.

## Acceptance proof

Local acceptance must prove all of the following:

1. `user_total_wallet_balances` reports the live source-balance sum plus immutable Total-Wallet-only adjustments.
2. New payout reserve decreases Total Wallet only.
3. Component balances are unchanged by payout reserve, rejection, and completion.
4. Rejection restores exactly the reserved Total Wallet amount.
5. Payout cannot reserve more than Total Wallet.
6. Package purchase/activation decreases Total Wallet only.
7. `MAIN`, `PACKAGE_EARNINGS`, `REFERRAL_COMMISSION`, and `REWARDS` remain unchanged by package purchase.
8. Package activation fails atomically when Total Wallet is insufficient.
9. Double-spend between payout reserve and package funding is rejected atomically.
10. Ledger transactions remain balanced and Total Wallet adjustment events are immutable/idempotent.
11. Migration deploy succeeds with MySQL binary logging enabled and without granting `SUPER` or changing global trust settings.
