# RWD-01 / OPS-01 Local Acceptance Checkpoint — 2026-08-28

Status: **PARTIAL LOCAL ACCEPTANCE GREEN — FIRST SCHEDULED REWARD SETTLEMENT PENDING**

This checkpoint records local API and browser evidence gathered on the feature branch before any PR to `main`.

## Code and database gates

- combined backend/admin local verification passed;
- backend unit tests passed: 38 suites / 223 tests;
- backend build passed;
- admin lint, typecheck and production build passed;
- Prisma migration `0015_platform_operations_simplification` applied locally;
- `system_operations_config` readback confirmed `platformTimezone = Asia/Kolkata` and `operationsMode = AUTOMATIC`;
- legacy accounting configuration remained synchronized as `AUTO_ON_APPROVAL`.

## OPS-01 API acceptance

Postman acceptance passed for:

- SUPER_ADMIN operations configuration read/write;
- `Asia/Kolkata` platform timezone;
- invalid IANA timezone rejection;
- `AUTOMATIC -> CONTROLLED_MANUAL -> AUTOMATIC` round trip;
- legacy accounting-mode synchronization;
- final safe state restored to `AUTOMATIC`.

The intentional invalid-timezone request returned HTTP 400 and was treated as a passing negative test.

## Fresh AUTO-chain acceptance

A fresh QA buyer was created and the full normal-path chain was accepted locally:

```text
fresh USER
-> package deposit
-> TXID submission
-> one ADMIN approval
-> approved-deposit accounting
-> package activation
-> referral commission processing
-> reward lifecycle initialization
```

Accepted invariants:

- one approval initiated the complete downstream AUTOMATIC chain;
- no normal-path manual accounting or activation step was required;
- deposit ledger and package-funding ledger readbacks were balanced;
- new subscription snapshot used `settlementTimezone = Asia/Kolkata`;
- historical UTC subscription snapshot remained unchanged;
- reward lifecycle initialized without paying an immediate daily reward;
- commission and reward reconciliation retries were idempotent;
- direct package-plan settlement-timezone override was rejected; Platform Operations remains the single configurable timezone source.

## Browser/UI acceptance

Browser evidence accepted on 2026-08-28:

- Platform Operations renders a supported IANA timezone dropdown instead of free text;
- selected platform timezone is `Asia/Kolkata — India Standard Time (IST)`;
- fresh AUTO-chain subscription is ACTIVE and shows Payment Approved activation;
- fresh reward state is ACTIVE with `0` settled rewards;
- fresh reward state next boundary is `29 Aug 2026, 12:00 am IST`;
- an older immutable UTC subscription still shows its corresponding `05:30 am IST` boundary;
- reward event history is empty before the first due settlement;
- commission reconciliation is empty after processing;
- fresh commission processing completed; where the receiver lacked a qualifying active package, the plan correctly recorded a zero-value LOST outcome rather than inventing commission;
- fresh buyer wallet has no Package Earnings before the first scheduled reward;
- no approved deposits are waiting for accounting after the fresh AUTO flow.

## Remaining RWD-01 financial acceptance

Do not mark RWD-01 complete until the first real scheduled reward boundary occurs naturally. No HTTP `asOf`, backdating, direct reward insertion or other QA bypass is permitted.

For the fresh `Asia/Kolkata` subscription, after the first due boundary the isolated acceptance must prove:

```text
exactly one PACKAGE_REWARD event
selected rate persisted at 6 decimals
calculated/posted reward at DECIMAL(20,8)
capConsumed advances exactly
source key = SUBSCRIPTION:<subscriptionId>:PACKAGE_REWARD:<localRewardDate>
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE
CREDIT USER   / PACKAGE_EARNINGS
debit = credit
wallet Package Earnings increases exactly by posted reward
same-day retry creates no duplicate event or ledger transaction
```

Keep `REWARD_WORKER_ENABLED=false` for the isolated first-settlement proof. Automatic worker/idempotency behavior is verified only after the manual same-service settlement path is proven.

## PR status

**PR to `main` remains HOLD.**

After first reward settlement and worker duplicate-safety acceptance, perform the planned clean-database full-system acceptance before opening the PR.
