# FixTradeZone — SIM-01 Simulated Trade Activity Lock

Status: DRAFT CONTRACT FOR FOUNDER REVIEW

## Scope
SIM-01 is a display-only simulated activity module. FixTradeZone does not execute real trades, connect to brokers/exchanges for execution, or create realized/withdrawable trading profit from this module.

Every ADMIN/USER/public presentation must use explicit labels such as `Simulated Trade Activity` and `SIMULATED RESULTS`.

## Financial isolation
- No wallet balance mutation.
- No immutable financial ledger posting.
- No package earnings mutation.
- No referral commission mutation.
- No reward/cap/lifecycle mutation.
- No deposit/subscription mutation.
- No simulated result may be represented as withdrawable money or realized trading profit.

## Configuration boundary
SUPER_ADMIN may configure a versioned simulated-activity policy containing:
- enabled/disabled state;
- target simulated activities per local calendar day (initial safe default: 5/day);
- allowed asset symbols;
- WIN/LOSS outcome mix or weights;
- simulated percentage/result ranges per outcome;
- allowed local timing window(s);
- platform timezone used for new simulated schedule generation;
- effective-from timestamp and audited reason.

Unsupported or incomplete policy states fail closed and generate no simulated activity.

## Determinism and auditability
- Generated simulated events are immutable once committed.
- Each event stores the exact policy/version snapshot reference used to generate it.
- A committed event is never rerandomized.
- Re-running the daily generator is idempotent and cannot create duplicates for the same deterministic event slot.
- Random selection is for display simulation only and is never a financial calculation input.

## Daily generation
Initial execution model:
- DAILY_CALENDAR schedule.
- Calendar-day boundaries follow the configured Platform Operations timezone at generation time.
- Default target is 5 simulated events/day, configurable by SUPER_ADMIN.
- Event times are distributed inside configured timing windows.
- Event asset/outcome/result are generated only from the published effective policy.
- A worker/reconciliation path may call one authoritative idempotent service.

## USER display
USER workspace may show:
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

Only SUPER_ADMIN may publish/change the versioned simulation policy.

## Acceptance invariants
Before SIM-01 can be accepted:
1. backend and admin automated gates GREEN;
2. migration explicitly reviewed/applied locally if required;
3. Postman verifies RBAC, policy versioning, idempotent generation and fail-closed states;
4. browser verifies ADMIN and USER labels/data/timezone;
5. SQL readback proves immutable/idempotent event generation;
6. wallet/ledger/rewards/commissions remain byte-for-byte logically unaffected by simulated event generation;
7. docs/current state are updated before PR.

## Release dependency
SIM-01 may be implemented while RWD-01 waits for its natural midnight settlement proof, but SIM-01 must not alter the retained RWD acceptance specimen or reward worker configuration. RWD-01 financial acceptance remains an independent prerequisite before production release.
