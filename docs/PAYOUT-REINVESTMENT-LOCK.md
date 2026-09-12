# PAYOUT-REINVEST-01 — Total Wallet Reinvestment Lock

Status: **IMPLEMENTED / LOCAL ACCEPTANCE REQUIRED**.

This addendum supersedes SUB-02 only for the explicit **Payouts → Reinvestment** path. It does not change the existing **Packages → Deposit / TXID** purchase path.

## User flows

```text
Packages → Choose Investment → Deposit / TXID → approval/accounting → activation
```

remains unchanged.

Payouts now exposes:

```text
Action = Payout
Action = Reinvestment
```

### Payout

- source is authoritative Total Wallet only;
- creates the normal immutable payout request/reserve workflow;
- requires a public destination address;
- applies the published payout fee policy.

### Reinvestment

- source is authoritative Total Wallet only;
- does not create a payout request, payout fee, destination address or blockchain transfer;
- the USER enters an exact amount;
- the UI shows only AVAILABLE published packages whose investment range accepts that amount;
- the USER selects one eligible package;
- the backend revalidates amount, package, effective plan, active-package rules and Total Wallet availability;
- the exact amount becomes package principal;
- Total Wallet debit + balanced package-principal funding + subscription creation are atomic/idempotent.

## Amount eligibility

For range packages:

```text
minimumInvestment <= amount <= maximumInvestment
```

A NULL maximum is open-ended. For exact-price packages the amount must equal the configured price.

Frontend filtering is convenience only; backend validation is authoritative.

## Lineage

Deposit-funded subscriptions retain normal immutable deposit lineage.

A Payouts reinvestment has no external deposit and therefore snapshots:

```text
fundingSource = TOTAL_WALLET
purchaseRequestKey = request UUID
sourceDepositId = NULL
sourceDepositAccountingTransactionId = NULL
```

This is why the nullable lineage introduced by applied migration 0040 is retained.

## Migration 0041 recovery

The earlier pre-acceptance 0041 attempted to restore NOT NULL deposit lineage and failed locally because the column participates in a foreign key. That interpretation is obsolete under PAYOUT-REINVEST-01.

The corrected 0041 only restores `referral_commission_runs.sourceDepositId` to nullable. After pulling the corrected migration, a database where 0041 is currently marked failed must be marked rolled back and then deployed again with `prisma migrate deploy`; never use `prisma migrate dev` or reset the database.

## Acceptance gate

Before PR to main, verify locally in this order:

1. migration recovery/deploy succeeds;
2. Postman payout API still uses Total Wallet only;
3. Postman reinvestment with an amount-eligible package succeeds;
4. out-of-range package selection fails atomically;
5. insufficient Total Wallet fails atomically;
6. idempotent retry does not double-debit;
7. browser Packages still routes to Deposit / TXID exactly as before;
8. browser Payouts shows Payout / Reinvestment and filters packages by amount;
9. SQL proves Total Wallet debit, unchanged component balances, balanced ledger entries and correct subscription lineage.
