# TOTAL-WALLET-01 — Payout / Reinvestment Spendable Balance Lock

Status: **IMPLEMENTED / LOCAL ACCEPTANCE IN PROGRESS**.

## Final business lock

The existing package catalogue purchase flow remains unchanged:

```text
Packages page
→ choose package
→ Deposit / TXID flow
→ authorized approval/accounting
→ package activation
```

The Payouts workspace has two explicit Total Wallet actions:

```text
Payout       → Total Wallet → external payout request
Reinvestment → Total Wallet → amount-eligible package activation
```

There is **no `Purchase from Total Wallet` action on the Packages page**. Reinvestment is exposed only from the Payouts workspace.

## Payout action

For a new payout request, the only USER spend source is `TOTAL_WALLET`.

The four component balances retain their accounting/classification meaning:

- `MAIN`
- `PACKAGE_EARNINGS`
- `REFERRAL_COMMISSION`
- `REWARDS`

A payout reserve/release must not rewrite those four component balances.

A rejected/cancelled payout restores the corresponding Total Wallet reserve exactly once. A completed payout does not restore it.

## Reinvestment action

Reinvestment is not an external payout and does not create a blockchain transfer, destination address, or payout fee.

USER flow:

```text
Payouts
→ Action = Reinvestment
→ enter exact amount
→ UI shows only AVAILABLE published packages whose investment range contains that amount
→ USER selects one eligible package
→ backend revalidates package, amount, active-package rules and Total Wallet availability
→ Total Wallet is debited atomically
→ balanced package-principal ledger funding is posted
→ package subscription is activated idempotently
```

For a range package, eligibility is:

```text
minimumInvestment <= entered amount <= maximumInvestment
```

If `maximumInvestment` is open-ended, only the minimum boundary applies. For an exact-price package, the amount must equal the configured package price.

Reinvestment uses the **full entered amount** as package principal. The four component balances are not rewritten by the reinvestment debit.

## Existing package purchase remains deposit-backed

The Packages page continues to use the established payment/activation chain:

```text
Published package plan/item
→ USER creates the package-specific deposit
→ USER submits the public network TXID
→ authorized deposit review approves the payment
→ approved-deposit accounting credits USER Main / Deposit
→ SUB-02 package activation consumes the approved package principal
```

That route must not be redirected to Total Wallet and must not expose the Payouts reinvestment control.

## Reinvestment lineage

A reinvestment has no external deposit, so its package subscription uses:

```text
fundingSource = TOTAL_WALLET
purchaseRequestKey = immutable idempotency key
sourceDepositId = NULL
sourceDepositAccountingTransactionId = NULL
```

Deposit-funded subscriptions continue writing their normal immutable deposit lineage.

The Total Wallet debit and package-principal ledger transaction use deterministic/idempotent source keys and commit atomically with the subscription creation.

## Migration boundary

Migration `0039_total_wallet_spendable_balance` introduced authoritative Total Wallet accounting and payout support.

Migration `0040_total_wallet_package_purchase` was already applied during pre-acceptance work. Its nullable subscription lineage and `fundingSource` / `purchaseRequestKey` columns are retained because the explicit Payouts → Reinvestment action requires them.

Migration `0041_restore_deposit_package_purchase` is now a compatibility correction after the earlier local failed attempt. It does **not** remove the 0040 columns. It restores `referral_commission_runs.sourceDepositId` to nullable so a reinvestment can preserve a no-deposit lineage safely.

The original Packages → Deposit / TXID UI remains unchanged despite those database capabilities.

## Acceptance requirements

Before merge, local evidence must prove:

1. Packages still routes `Choose Investment` to the original Deposit/TXID flow;
2. Packages has no direct `Purchase from Total Wallet` action;
3. Payouts exposes `Action = Payout | Reinvestment`;
4. Payout uses Total Wallet only and preserves all four component balances;
5. Reinvestment package choices are filtered by the exact entered amount;
6. backend rejects a selected package when the amount is outside its published range;
7. reinvestment rejects insufficient Total Wallet atomically;
8. successful reinvestment decreases Total Wallet by the exact package principal;
9. successful reinvestment creates no payout request, payout fee, destination address, or external TXID;
10. reinvestment funding ledger entries are balanced and immutable;
11. retry with the same request key is idempotent and never double-debits Total Wallet;
12. payout rejection restores only its own reserve and does not affect reinvestment history.

## History rule

Existing package/deposit/payout/ledger history remains immutable. This change adds the explicit Payouts reinvestment action without altering the established Packages → Deposit / TXID user flow.
