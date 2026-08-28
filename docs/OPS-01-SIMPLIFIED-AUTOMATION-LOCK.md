# OPS-01 — Simplified Automation & Platform Time Lock

**Status:** LOCKED / APPROVED 2026-08-28  
**Owner:** Founder / SUPER_ADMIN  
**Scope:** FixTradeZone operational automation, platform timezone, deposit approval orchestration, recovery controls, and scheduled reward execution.

## Purpose

FixTradeZone must keep the normal operational path simple without weakening financial safety. A normal operator should not need to manually post accounting, activate a package, process commission, and initialize rewards as separate everyday steps when SUPER_ADMIN has selected automatic operation.

Manual actions remain available for controlled recovery, QA, migration, incident handling, and package plans that explicitly require manual activation.

## Locked Rules

### OPS-01-01 — One SUPER_ADMIN operations mode

The platform exposes one high-level SUPER_ADMIN operations mode:

- `AUTOMATIC` — recommended normal production mode.
- `CONTROLLED_MANUAL` — controlled recovery / QA / migration / incident mode.

The initial safe default is `AUTOMATIC`, except an upgrade must preserve an explicitly configured legacy manual deposit-accounting mode by mapping it to `CONTROLLED_MANUAL`.

The legacy accounting configuration remains synchronized for compatibility and must never contradict the authoritative operations mode.

### OPS-01-02 — One configurable platform timezone

SUPER_ADMIN controls one IANA platform timezone used by admin and USER operational timestamp displays.

Initial/default value:

```text
Asia/Kolkata
```

Database timestamps remain absolute timestamps. Existing immutable ledger transactions, reward events, commission events, deposits, subscriptions, and their immutable settlement-timezone snapshots are never rewritten when the platform display timezone changes.

Package/reward settlement calculations continue to use the immutable subscription settlement timezone required by the applicable package/reward contract. Platform display timezone does not silently alter a historical financial contract.

### OPS-01-03 — Automatic one-approval happy path

When `operationsMode=AUTOMATIC`, an authorized deposit approval executes the safe downstream chain in order:

```text
Deposit approval
  -> approved-deposit ledger posting
  -> eligible package activation
  -> referral commission processing
  -> package reward/cap lifecycle initialization
```

Each stage must use its existing authoritative, idempotent business service and financial controls.

A package whose immutable plan snapshot requires `MANUAL_ACTIVATION` remains manual even when global operations mode is `AUTOMATIC`. Global automation never overrides a package business rule.

### OPS-01-04 — Reward initialization is not immediate reward payout

Deposit approval/package activation initializes the reward lifecycle when an effective supported reward policy exists.

It does **not** create an immediate daily reward merely because the deposit was approved.

The first and subsequent package reward events remain governed by the locked RWD schedule and are posted only when their scheduled local reward boundary is due.

### OPS-01-05 — Stage isolation and recoverability

A committed successful stage must never be reported as failed because a later downstream stage requires recovery.

Examples:

- If deposit approval succeeds but accounting fails, the deposit remains approved and accounting is recoverable.
- If accounting succeeds but activation fails, accounting remains posted exactly once and activation is recoverable.
- If package activation succeeds but commission processing fails, the package remains ACTIVE and commission is recoverable.
- If package activation succeeds but reward-state initialization fails, the package remains ACTIVE and reward initialization is recoverable.

Recovery calls must remain idempotent and must not duplicate ledger postings, package subscriptions, commission runs/events, or reward events.

### OPS-01-06 — Controlled Manual mode

When `operationsMode=CONTROLLED_MANUAL`:

- deposit review/approval remains available;
- approved-deposit downstream accounting is not automatically posted;
- package activation is not automatically invoked from approval;
- commission processing is not automatically invoked from approval;
- reward lifecycle initialization is not automatically invoked from approval;
- scheduled automatic reward processing is paused by operational policy.

Authorized recovery/reconciliation endpoints remain available for controlled use.

### OPS-01-07 — Reward worker two-key safety

Automatic reward processing requires both:

```text
REWARD_WORKER_ENABLED=true
AND
operationsMode=AUTOMATIC
```

`REWARD_WORKER_ENABLED` remains an infrastructure/emergency kill switch. SUPER_ADMIN operations mode is the business-operational switch. Either one may stop automatic reward execution.

### OPS-01-08 — Manual controls are recovery controls

Normal production UI must emphasize the automatic happy path.

Manual/reconciliation actions such as accounting repost/reconcile, package activation reconciliation, commission reconciliation, and reward reconciliation must be presented as advanced/recovery operations rather than normal everyday steps.

No arbitrary financial amount override, arbitrary reward-date override, or arbitrary HTTP `asOf` override is introduced to make testing easier.

### OPS-01-09 — Auditability

Every SUPER_ADMIN operations configuration mutation is audited with previous/current values and actor/request context.

Changing automation mode or platform timezone never mutates historical immutable financial records.

### OPS-01-10 — Acceptance gate

OPS-01 is not accepted for merge merely because code compiles or CI passes.

Before PR to `main`, the feature branch must pass:

1. backend and admin automated verification;
2. local database migration verification;
3. consolidated Postman/API acceptance;
4. consolidated browser/UI acceptance;
5. idempotency and double-post protection checks;
6. AUTO and CONTROLLED_MANUAL behavior checks;
7. platform timezone display checks across affected admin and USER screens;
8. ledger balance and reward/commission lifecycle checks.

Only after all acceptance evidence is green may documentation be marked locally accepted and a PR be raised to `main`.

## Locked normal production experience

```text
USER submits payment / transaction ID
        ↓
Authorized ADMIN approves once
        ↓
Deposit APPROVED
        ↓
Accounting posts automatically
        ↓
Eligible package activates automatically
        ↓
Referral commission processes automatically
        ↓
Reward lifecycle initializes automatically
        ↓
Scheduled reward worker posts rewards only when due
```

This contract is intentionally simple at the UI level while preserving immutable accounting, idempotency, package-plan rules, commission eligibility, reward/cap rules, RBAC, and auditability underneath.
