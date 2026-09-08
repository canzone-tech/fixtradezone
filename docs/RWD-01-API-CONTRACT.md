# RWD-01 — API & Runtime Acceptance Contract

Status: **IMPLEMENTED ON FEATURE BRANCH / LOCAL RUNTIME ACCEPTANCE PENDING**.

This module-specific contract supplements `docs/API-CONTRACT.md` and
`docs/REWARDS-CAPS-LIFECYCLE.md`. It records the exact RWD-01 HTTP boundary used
for Postman and browser acceptance.

Development NestJS base URL:

```text
http://localhost:3000
```

All endpoints below are authenticated by the existing JWT/session boundary and
return `Cache-Control: no-store` where implemented by the controllers.

## USER

### `GET /rewards/me`

Returns the authenticated USER's package reward lifecycle states and immutable
settled package reward history.

Query:

```text
page  optional positive integer
limit optional bounded positive integer
```

The USER cannot request another user's reward history through this endpoint.

Browser BFF:

```text
GET /api/user/rewards -> GET /rewards/me
```

The USER `/user/packages` surface consumes this read model. Settled reward money
appears separately through the wallet `PACKAGE_EARNINGS` ledger bucket.

## ADMIN / SUPER_ADMIN — policy reads

### `GET /admin/reward-policies`

Requires:

```text
rewards.read
```

Lists versioned reward/cap policy records.

### `GET /admin/reward-policies/:policyVersionId`

Requires `rewards.read` and a UUID policy ID.

Published policy economics are immutable historical configuration.

## SUPER_ADMIN — policy writes

RWD-01 policy create/update/publish commands are intentionally SUPER_ADMIN-only.
They are not exposed as an arbitrary financial posting permission.

### `POST /admin/reward-policies/drafts`

Creates a new versioned DRAFT, normally by cloning a reviewed policy version.
A DRAFT has zero reward financial effect.

### `PATCH /admin/reward-policies/:policyVersionId`

Updates a DRAFT using optimistic `expectedRevision` plus an audit reason.
Published policies cannot be rewritten.

The initial executable publication boundary requires:

```text
existingSubscriptionRolloutMode   = FORWARD_ONLY_FROM_POLICY_EFFECTIVE
packageRewardCountsTowardCap      = true
referralCommissionCountsTowardCap = false
teamCommissionCountsTowardCap     = false
awardRewardCountsTowardCap        = false
otherIncomeCountsTowardCap         = false
```

A draft may retain future schema values for review, but publication fails closed
when the corresponding financial engine is not implemented/accepted.

### `POST /admin/reward-policies/:policyVersionId/publish`

SUPER_ADMIN only.

Request requires optimistic revision and audit reason; optional effective dates
must satisfy publication/effective-range safety rules. Backdated publication is
rejected.

The initial published rollout is forward-only. Publication must never trigger a
historical reward backfill by itself.

## ADMIN / SUPER_ADMIN — reward operations

### `GET /admin/rewards`

Requires:

```text
rewards.read
```

Returns immutable package reward events with package/rate/cap/lifecycle and
ledger transaction snapshot data.

### `GET /admin/rewards/states`

Requires `rewards.read`.

Returns current per-subscription reward/cap/lifecycle state.

### `GET /admin/rewards/reconciliation`

Requires:

```text
rewards.reconcile
```

Returns due/blocked subscriptions requiring operational visibility/recovery.

### `GET /admin/rewards/worker-health`

Requires `rewards.read`.

Response includes worker execution telemetry plus the authoritative operations
configuration state:

```text
lastStartedAt
lastCompletedAt
lastErrorAt
lastError
lastSummary
infrastructureEnabled
operationsMode
platformTimezone
automaticProcessingEnabled
intervalMs
```

`automaticProcessingEnabled` is true only when both conditions hold:

```text
REWARD_WORKER_ENABLED infrastructure switch = enabled
system operations mode                       = AUTOMATIC
```

### `POST /admin/rewards/process-due`

Requires `rewards.reconcile`.

This is a controlled recovery/reconciliation command. It invokes the same
idempotent reward calculation/posting service used by the automatic worker.

It accepts **no reward amount, rate, cap value or posting override**.

Summary response includes:

```text
asOf
initialized
processedSubscriptions
createdEvents
completedSubscriptions
blockedSubscriptions
remainingDue
```

### `POST /admin/subscriptions/:subscriptionId/process-rewards`

Requires `rewards.reconcile` and a UUID subscription ID.

Runs authoritative reward reconciliation for one immutable subscription. It is
not a second calculation path and must be safe to retry.

## Operations mode dependency

The platform-wide operations configuration is separate from RWD policy economics:

```text
GET   /admin/settings/operations
PATCH /admin/settings/operations
```

Current safety boundary is SUPER_ADMIN-only and audited.

Operations modes:

```text
AUTOMATIC
CONTROLLED_MANUAL
```

`AUTOMATIC` allows the Redis-locked reward worker to process due boundaries.
`CONTROLLED_MANUAL` pauses scheduled automatic reward processing while leaving
authorized reconciliation/recovery commands available.

Changing operations mode never rewrites historical reward events, cap state or
ledger transactions.

## Authoritative settlement invariants

A package reward can be created only from an immutable ACTIVE subscription with
an effective executable reward/cap policy.

Initial daily identity:

```text
SUBSCRIPTION:<subscriptionId>:PACKAGE_REWARD:<localRewardDate>
```

Financial posting:

```text
DEBIT  SYSTEM / PACKAGE_REWARD_EXPENSE / <currency>
CREDIT USER   / PACKAGE_EARNINGS       / <currency>
```

The event, cap/lifecycle state update, ledger transaction and balance read-model
update are one atomic financial operation.

Selected rate precision:

```text
DECIMAL(9,6)
```

Money precision:

```text
DECIMAL(20,8)
```

Money calculation settles with deterministic round-down to eight decimals. A
final reward is clipped to exact cap headroom and never posts above the cap.

## Initial fail-closed boundary

Runtime execution accepts the approved RWD-01 combination only:

```text
FIXED | RANDOM_RANGE
USER_NET_AFTER_SPLIT
NEXT_CALENDAR_DAY
DAILY_CALENDAR
CALENDAR_DAYS
EVERY_DAY
TOTAL_RETURN
INCLUDED_IN_TOTAL_RETURN
AUTO_START_NEXT_CYCLE
COMPLETE_PACKAGE
FORWARD_ONLY_FROM_POLICY_EFFECTIVE
```

Unsupported rate/split/calendar/principal/retroactive engines must return a
blocked/rejected outcome rather than inventing semantics.

## Local Postman acceptance order

1. authenticate as SUPER_ADMIN;
2. read reward policies and confirm V1 DRAFT has no effective date/financial effect;
3. read operations configuration;
4. set/confirm `CONTROLLED_MANUAL` while inspecting migration and initialization behavior;
5. publish the reviewed forward-only V1 policy;
6. reconcile an existing ACTIVE subscription and prove no pre-policy backfill;
7. inspect state/events/reconciliation/worker-health;
8. switch to `AUTOMATIC` only for the scheduled-worker test when appropriate;
9. process a controlled due subscription through the authoritative API path;
10. repeat processing/reconciliation and prove no duplicate reward event/ledger transaction;
11. verify permission negatives for an actor without `rewards.read` / `rewards.reconcile` and policy-write rejection for non-SUPER_ADMIN;
12. return operations configuration to the intended accepted launch mode.

## Required SQL/accounting evidence

For a settled QA reward, local acceptance must read back:

- exactly one immutable `package_reward_events` row for the deterministic source key;
- matching `package_reward_states` cap before/after progression;
- exactly one `PACKAGE_REWARD_CREDIT` ledger transaction;
- exactly one SYSTEM `PACKAGE_REWARD_EXPENSE` debit and USER `PACKAGE_EARNINGS` credit for equal amount/currency;
- USER Package Earnings balance increased by the posted reward exactly once;
- repeated processing creates no second financial settlement;
- completion/clipping reason is retained when the test reaches a terminal boundary.

Browser acceptance must show the same persisted facts on ADMIN `/rewards`, USER
`/user/packages`, USER `/user/wallet`, and the SUPER_ADMIN Operations settings
surface. Timestamps must use the configured platform timezone for display while
settlement history retains immutable logical-date/timezone snapshots.

No production HTTP `asOf`, arbitrary amount input or time-travel backdoor may be
introduced for QA convenience.
