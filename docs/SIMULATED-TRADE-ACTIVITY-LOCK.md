# FixTradeZone — SIM-01 Simulated Trade Activity Lock

Status: LOCKED / FOUNDER APPROVED

## Scope
SIM-01 is a display-only simulated activity module. FixTradeZone does not execute real trades, connect to brokers/exchanges for execution, or create realized/withdrawable trading profit from this module.

Every ADMIN/USER/public presentation must use explicit labels such as `Simulated Trade Activity` and `SIMULATED RESULTS — NOT REAL TRADING`.

## Eligibility and ownership
- Only ACTIVE package subscriptions are eligible.
- Generation is per ACTIVE package subscription, not merely per USER account.
- Initial safe default is 5 simulated activities per eligible subscription per local calendar day.
- A USER with two ACTIVE subscriptions may therefore receive up to 10 simulated activity rows/day under the initial default.
- Every event snapshots/retains its source subscription, package identity and policy version.
- COMPLETED, SUPERSEDED and CANCELLED subscriptions generate no new simulated activity.

## Financial isolation
- No wallet balance mutation.
- No immutable financial ledger posting.
- No package earnings mutation.
- No referral commission mutation.
- No reward/cap/lifecycle mutation.
- No deposit/subscription mutation.
- No simulated result may be represented as withdrawable money or realized trading profit.
- Simulation outcomes are never inputs to package reward, cap, commission or eligibility calculations.

## Configuration boundary
SUPER_ADMIN may configure a versioned simulated-activity policy containing:
- enabled/disabled state;
- target simulated activities per eligible subscription per local calendar day (initial safe default: 5/day);
- allowed asset symbols;
- WIN/LOSS outcome weights;
- simulated percentage/result ranges per outcome;
- allowed local timing window(s);
- effective-from timestamp and audited reason.

The Platform Operations timezone is authoritative for new simulated schedule generation. A policy stores the timezone snapshot used for each published version so historical generated events remain explainable after later platform-time changes.

Unsupported, incomplete or invalid policy states fail closed and generate no simulated activity.

## Determinism and auditability
- Generated simulated events are immutable once committed.
- Each event stores the exact policy/version reference used to generate it.
- A committed event is never rerandomized or edited.
- Re-running the daily generator is idempotent and cannot create duplicates for the same deterministic subscription/date/slot identity.
- Random selection is for display simulation only and is never a financial calculation input.
- Deterministic source identity is:

```text
SUBSCRIPTION:<subscriptionId>:SIMULATED_ACTIVITY:<localActivityDate>:<slotNumber>
```

## Daily generation
Initial execution model:
- DAILY_CALENDAR schedule.
- Calendar-day boundaries follow the policy timezone snapshot taken from Platform Operations when that policy version is published.
- Default target is 5 simulated events/day/subscription, configurable by SUPER_ADMIN.
- Event times are distributed inside configured timing windows.
- Event asset/outcome/result are generated only from the effective published policy.
- One authoritative idempotent service is shared by worker and authorized reconciliation paths.

## Worker and operations mode
- Infrastructure kill switch: `SIMULATED_ACTIVITY_WORKER_ENABLED`.
- Missing/unspecified worker flag fails safe to OFF.
- Optional interval: `SIMULATED_ACTIVITY_WORKER_INTERVAL_MS`; initial default 60 seconds, minimum 10 seconds.
- Automatic generation requires BOTH:
  - `SIMULATED_ACTIVITY_WORKER_ENABLED=true`; and
  - Platform Operations `operationsMode=AUTOMATIC`.
- `CONTROLLED_MANUAL` pauses scheduled generation while keeping authorized idempotent reconciliation available.
- Redis distributed locking prevents overlapping worker batches across instances.

## USER display
USER workspace may show:
- source package/subscription;
- local simulated event time;
- asset;
- explicit WIN/LOSS simulated outcome;
- simulated percentage/result;
- immutable historical simulated events;
- prominent `SIMULATED RESULTS — NOT REAL TRADING` disclosure.

No USER action starts, stops, places or closes a real trade.

## ADMIN display
ADMIN/SUPER_ADMIN workspace may show:
- effective simulated-activity policy;
- generated-event history;
- due/missing simulated slots;
- worker/generator health;
- authorized idempotent reconciliation action.

Only SUPER_ADMIN may publish/change the versioned simulation policy. ADMIN may receive read/reconciliation permission without authority to rewrite commercial/configuration history.

## Initial safe defaults
```text
scope                  = PER_ACTIVE_SUBSCRIPTION
activitiesPerDay       = 5
schedule               = DAILY_CALENDAR
worker default         = OFF
operations authority   = Platform Operations
financial effect       = NONE
history                = IMMUTABLE
```

Initial seeded asset/range/timing values are configuration defaults only and may be changed through a new published policy version. Existing committed events are never rewritten.

## Acceptance invariants
Before SIM-01 can be accepted:
1. backend and admin automated gates GREEN;
2. migration explicitly reviewed/applied locally if required;
3. Postman verifies RBAC, policy versioning, idempotent generation and fail-closed states;
4. browser verifies ADMIN and USER labels/data/timezone;
5. SQL readback proves immutable/idempotent event generation;
6. wallet/ledger/rewards/commissions remain logically unaffected by simulated event generation;
7. docs/current state are updated before PR.

## Release dependency
SIM-01 may be implemented while RWD-01 waits for its natural midnight settlement proof, but SIM-01 must not alter the retained RWD acceptance specimen or reward worker configuration. RWD-01 financial acceptance remains an independent prerequisite before production release.
